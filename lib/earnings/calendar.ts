import fs from "node:fs";
import path from "node:path";

import * as cheerio from "cheerio";

import { todayKey } from "../utils";
import { findEarningsCompany, REGION_ORDER } from "./watchlist";
import type {
  EarningsCalendarSnapshot,
  EarningsCandidate,
  EarningsCompany,
  EarningsConfirmationStatus,
  EarningsEvent,
  EarningsSourceStatus,
  EarningsTiming,
} from "./types";

const DEFAULT_LOOKAHEAD_DAYS = 7;
const DEFAULT_MAX_EVENTS = 12;
const FETCH_TIMEOUT_MS = 20_000;

const WEB_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
} as const;

const JSON_HEADERS = {
  ...WEB_HEADERS,
  Accept: "application/json, text/plain, */*",
} as const;

type ProviderResult = {
  events: EarningsCandidate[];
  status: EarningsSourceStatus;
};

type FetchEarningsOptions = {
  startDate?: string;
  lookaheadDays?: number;
  maxEvents?: number;
  overridesPath?: string;
};

function parsePositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function addDaysKey(dateKey: string, days: number): string {
  const [year, month, day] = dateKey.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function dateKeysBetween(start: string, end: string): string[] {
  const keys: string[] = [];
  for (let key = start; key <= end; key = addDaysKey(key, 1)) {
    keys.push(key);
  }
  return keys;
}

function inWindow(dateKey: string, start: string, end: string): boolean {
  return dateKey >= start && dateKey <= end;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function fetchText(
  url: string,
  init: RequestInit = {},
  timeoutMs = FETCH_TIMEOUT_MS,
): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    if (/Just a moment|cf-browser-verification|Cloudflare/i.test(text)) {
      throw new Error("blocked by anti-bot challenge");
    }
    return text;
  } finally {
    clearTimeout(timer);
  }
}

function parseDateKey(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const trimmed = input.trim();
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  if (iso) return trimmed;
  const cleaned = trimmed.replace(/\([^)]+\)/gu, "").replace(/\s+/gu, " ").trim();
  const named = cleaned.match(
    /^(?:(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:day)?,\s*)?([A-Za-z]+)\s+(\d{1,2}),\s+(\d{4})$/u,
  );
  if (named) {
    const months: Record<string, number> = {
      january: 0,
      february: 1,
      march: 2,
      april: 3,
      may: 4,
      june: 5,
      july: 6,
      august: 7,
      september: 8,
      october: 9,
      november: 10,
      december: 11,
    };
    const month = months[named[1].toLowerCase()];
    if (month !== undefined) {
      const date = new Date(
        Date.UTC(Number(named[3]), month, Number(named[2])),
      );
      return date.toISOString().slice(0, 10);
    }
  }
  const parsed = Date.parse(cleaned);
  if (!Number.isFinite(parsed)) return undefined;
  const date = new Date(parsed);
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeWhitespace(input: string): string {
  return input.replace(/\u00a0/gu, " ").replace(/\s+/gu, " ").trim();
}

function cleanEstimate(input: string | undefined): string | undefined {
  if (!input) return undefined;
  const cleaned = normalizeWhitespace(input)
    .replace(/^\/\s*/u, "")
    .replace(/^\s*-\s*$/u, "")
    .trim();
  if (!cleaned || cleaned === "--" || cleaned === "N/A") return undefined;
  return cleaned;
}

function timingFromNasdaq(value: string | undefined): EarningsTiming {
  if (value === "time-pre-market") return "before_market";
  if (value === "time-after-hours") return "after_market";
  return "not_supplied";
}

function timingFromInvesting(
  dataValue: string | undefined,
  tooltip: string | undefined,
): EarningsTiming {
  const tip = (tooltip ?? "").toLowerCase();
  if (tip.includes("before")) return "before_market";
  if (tip.includes("after")) return "after_market";
  if (tip.includes("during")) return "during_market";
  if (dataValue === "1") return "before_market";
  if (dataValue === "3") return "after_market";
  return "not_supplied";
}

function coerceTiming(value: unknown): EarningsTiming {
  if (
    value === "before_market" ||
    value === "after_market" ||
    value === "during_market" ||
    value === "not_supplied"
  ) {
    return value;
  }
  return "not_supplied";
}

function coerceConfirmationStatus(
  value: unknown,
  fallback: EarningsConfirmationStatus,
): EarningsConfirmationStatus {
  return value === "confirmed" || value === "estimated" ? value : fallback;
}

function candidateFromCompany(
  company: EarningsCompany,
  fields: {
    report_date: string;
    timing?: EarningsTiming;
    fiscal_period?: string;
    eps_estimate?: string;
    revenue_estimate?: string;
    expectation_note?: string;
    source: string;
    source_url: string;
    confirmation_status: EarningsConfirmationStatus;
    source_priority: number;
  },
): EarningsCandidate {
  return {
    company_id: company.id,
    company: company.company,
    company_zh: company.company_zh,
    ticker: company.ticker,
    tickers: company.tickers,
    region: company.region,
    report_date: fields.report_date,
    timing: fields.timing ?? "not_supplied",
    fiscal_period: fields.fiscal_period,
    eps_estimate: fields.eps_estimate,
    revenue_estimate: fields.revenue_estimate,
    expectation_note: fields.expectation_note,
    source: fields.source,
    source_url: fields.source_url,
    confirmation_status: fields.confirmation_status,
    source_priority: fields.source_priority,
  };
}

interface NasdaqCalendarResponse {
  data?: {
    rows?: Array<{
      symbol?: string;
      name?: string;
      time?: string;
      fiscalQuarterEnding?: string;
      epsForecast?: string;
      noOfEsts?: string;
    }>;
  };
}

async function fetchNasdaqCalendar(start: string, end: string): Promise<EarningsCandidate[]> {
  const events: EarningsCandidate[] = [];
  for (const dateKey of dateKeysBetween(start, end)) {
    const url = `https://api.nasdaq.com/api/calendar/earnings?date=${dateKey}`;
    const text = await fetchText(url, {
      headers: {
        ...JSON_HEADERS,
        Origin: "https://www.nasdaq.com",
        Referer: "https://www.nasdaq.com/",
      },
    });
    const data = JSON.parse(text) as NasdaqCalendarResponse;
    for (const row of data.data?.rows ?? []) {
      const company = findEarningsCompany(row.symbol, row.name);
      if (!company) continue;
      const eps = cleanEstimate(row.epsForecast);
      events.push(
        candidateFromCompany(company, {
          report_date: dateKey,
          timing: timingFromNasdaq(row.time),
          fiscal_period: cleanEstimate(row.fiscalQuarterEnding),
          eps_estimate: eps,
          expectation_note:
            eps && row.noOfEsts
              ? `Nasdaq consensus EPS, ${row.noOfEsts} estimate(s)`
              : undefined,
          source: "Nasdaq Earnings Calendar",
          source_url: `https://www.nasdaq.com/market-activity/earnings?date=${dateKey}`,
          confirmation_status: "estimated",
          source_priority: 60,
        }),
      );
    }
  }
  return events;
}

interface InvestingCalendarResponse {
  data?: string;
}

export function parseInvestingCalendarHtml(
  html: string,
  start: string,
  end: string,
): EarningsCandidate[] {
  const $ = cheerio.load(`<table><tbody>${html}</tbody></table>`);
  const events: EarningsCandidate[] = [];
  let currentDate: string | undefined;

  $("tr").each((_, row) => {
    const $row = $(row);
    const dayText = normalizeWhitespace($row.find(".theDay").text());
    if (dayText) {
      currentDate = parseDateKey(dayText);
      return;
    }
    if (!currentDate || !inWindow(currentDate, start, end)) return;

    const $company = $row.find(".earnCalCompany");
    const name =
      normalizeWhitespace($company.find(".earnCalCompanyName").text()) ||
      normalizeWhitespace($company.attr("title") ?? "");
    const ticker = normalizeWhitespace($company.find("a.bold").first().text());
    if (!name && !ticker) return;

    const company = findEarningsCompany(ticker, name);
    if (!company) return;

    const cells = $row
      .find("td")
      .map((_, td) => normalizeWhitespace($(td).text()))
      .get();
    const $time = $row.find("td.time").first();
    const sourcePath = $company.find("a.bold").first().attr("href") ?? "";
    const sourceUrl = sourcePath.startsWith("http")
      ? sourcePath
      : `https://www.investing.com${sourcePath}`;

    events.push(
      candidateFromCompany(company, {
        report_date: currentDate,
        timing: timingFromInvesting(
          $time.attr("data-value"),
          $time.find("[data-tooltip]").first().attr("data-tooltip"),
        ),
        eps_estimate: cleanEstimate(cells[3]),
        revenue_estimate: cleanEstimate(cells[5]),
        expectation_note: "Investing.com public calendar forecast",
        source: "Investing.com Earnings Calendar",
        source_url: sourceUrl,
        confirmation_status: "estimated",
        source_priority: 50,
      }),
    );
  });

  return events;
}

async function fetchInvestingCalendar(start: string, end: string): Promise<EarningsCandidate[]> {
  const url =
    "https://www.investing.com/earnings-calendar/Service/getCalendarFilteredData";
  const body = new URLSearchParams({
    dateFrom: start,
    dateTo: end,
    currentTab: "custom",
    limit_from: "0",
  });
  const text = await fetchText(url, {
    method: "POST",
    body,
    headers: {
      ...JSON_HEADERS,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      Referer: "https://www.investing.com/earnings-calendar/",
    },
  });
  const data = JSON.parse(text) as InvestingCalendarResponse;
  if (!data.data) return [];
  return parseInvestingCalendarHtml(data.data, start, end);
}

export function parseTsmcFinancialCalendarHtml(
  html: string,
  start: string,
  end: string,
): EarningsCandidate[] {
  const text = cheerio.load(html).text();
  const lines = text
    .split(/\r?\n/u)
    .map(normalizeWhitespace)
    .filter(Boolean);
  const company = findEarningsCompany("TSM");
  if (!company) return [];

  const events: EarningsCandidate[] = [];
  for (let i = 0; i < lines.length; i++) {
    const dateKey = parseDateKey(lines[i]);
    if (!dateKey || !inWindow(dateKey, start, end)) continue;
    const nearby = lines.slice(i + 1, i + 6).join(" ");
    if (!/Results\s*-\s*Earnings Conference/i.test(nearby)) continue;
    const period = nearby.match(/\b\dQ'?\d{2}\b/u)?.[0];
    events.push(
      candidateFromCompany(company, {
        report_date: dateKey,
        timing: "after_market",
        fiscal_period: period,
        source: "TSMC Financial Calendar",
        source_url: "https://investor.tsmc.com/english/financial-calendar",
        confirmation_status: "confirmed",
        source_priority: 100,
      }),
    );
  }
  return events;
}

async function fetchTsmcOfficialCalendar(
  start: string,
  end: string,
): Promise<EarningsCandidate[]> {
  const url = "https://investor.tsmc.com/english/financial-calendar";
  const html = await fetchText(url, { headers: WEB_HEADERS });
  return parseTsmcFinancialCalendarHtml(html, start, end);
}

type OverrideRecord = {
  company_id?: unknown;
  symbol?: unknown;
  ticker?: unknown;
  company?: unknown;
  date?: unknown;
  report_date?: unknown;
  timing?: unknown;
  fiscal_period?: unknown;
  eps_estimate?: unknown;
  revenue_estimate?: unknown;
  expectation_note?: unknown;
  source_url?: unknown;
  confirmation_status?: unknown;
};

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseOverrideEvents(
  raw: unknown,
  start: string,
  end: string,
): EarningsCandidate[] {
  const records = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object" && Array.isArray((raw as { events?: unknown }).events)
      ? (raw as { events: unknown[] }).events
      : [];
  const events: EarningsCandidate[] = [];
  for (const item of records) {
    if (!item || typeof item !== "object") continue;
    const rec = item as OverrideRecord;
    const company =
      findEarningsCompany(stringField(rec.company_id)) ??
      findEarningsCompany(stringField(rec.symbol) ?? stringField(rec.ticker), stringField(rec.company));
    const reportDate = parseDateKey(
      stringField(rec.report_date) ?? stringField(rec.date),
    );
    if (!company || !reportDate || !inWindow(reportDate, start, end)) continue;
    events.push(
      candidateFromCompany(company, {
        report_date: reportDate,
        timing: coerceTiming(rec.timing),
        fiscal_period: stringField(rec.fiscal_period),
        eps_estimate: stringField(rec.eps_estimate),
        revenue_estimate: stringField(rec.revenue_estimate),
        expectation_note: stringField(rec.expectation_note),
        source: "Local earnings override",
        source_url: stringField(rec.source_url) ?? "earnings.overrides.json",
        confirmation_status: coerceConfirmationStatus(
          rec.confirmation_status,
          "confirmed",
        ),
        source_priority: 80,
      }),
    );
  }
  return events;
}

async function fetchOverrides(
  start: string,
  end: string,
  overridesPath: string,
): Promise<EarningsCandidate[]> {
  if (!fs.existsSync(overridesPath)) return [];
  const raw = JSON.parse(fs.readFileSync(overridesPath, "utf8")) as unknown;
  return parseOverrideEvents(raw, start, end);
}

function hasEstimate(event: EarningsEvent): boolean {
  return Boolean(event.eps_estimate || event.revenue_estimate);
}

function mergeMissing(
  base: EarningsCandidate,
  extra: EarningsCandidate,
): EarningsCandidate {
  const usedExtraEstimate =
    (!base.eps_estimate && Boolean(extra.eps_estimate)) ||
    (!base.revenue_estimate && Boolean(extra.revenue_estimate));
  const source =
    usedExtraEstimate && base.source !== extra.source
      ? `${base.source} + ${extra.source}`
      : base.source;
  const noteParts = [base.expectation_note, extra.expectation_note]
    .flatMap((note) => (note ? note.split(";") : []))
    .map((note) => note.trim())
    .filter(Boolean);
  const expectationNote =
    noteParts.length > 0 ? [...new Set(noteParts)].join("; ") : undefined;
  return {
    ...base,
    source,
    timing:
      base.timing === "not_supplied" && extra.timing !== "not_supplied"
        ? extra.timing
        : base.timing,
    fiscal_period: base.fiscal_period ?? extra.fiscal_period,
    eps_estimate: base.eps_estimate ?? extra.eps_estimate,
    revenue_estimate: base.revenue_estimate ?? extra.revenue_estimate,
    expectation_note: expectationNote,
  };
}

export function dedupeEarningsCandidates(
  candidates: EarningsCandidate[],
  maxEvents: number,
): EarningsEvent[] {
  const grouped = new Map<string, EarningsCandidate[]>();
  for (const candidate of candidates) {
    const list = grouped.get(candidate.company_id) ?? [];
    list.push(candidate);
    grouped.set(candidate.company_id, list);
  }

  const events: EarningsCandidate[] = [];
  for (const list of grouped.values()) {
    const sorted = [...list].sort((a, b) => {
      if (b.source_priority !== a.source_priority) {
        return b.source_priority - a.source_priority;
      }
      if (Number(hasEstimate(b)) !== Number(hasEstimate(a))) {
        return Number(hasEstimate(b)) - Number(hasEstimate(a));
      }
      return a.report_date.localeCompare(b.report_date);
    });
    let selected = sorted[0];
    for (const candidate of sorted.slice(1)) {
      if (candidate.report_date === selected.report_date) {
        selected = mergeMissing(selected, candidate);
      }
    }
    events.push(selected);
  }

  return events
    .sort((a, b) => {
      const byDate = a.report_date.localeCompare(b.report_date);
      if (byDate !== 0) return byDate;
      const byRegion = REGION_ORDER[a.region] - REGION_ORDER[b.region];
      if (byRegion !== 0) return byRegion;
      return b.source_priority - a.source_priority;
    })
    .slice(0, maxEvents)
    .map(({ source_priority: _sourcePriority, ...event }) => event);
}

async function runProvider(
  source_id: string,
  source_name: string,
  url: string | undefined,
  fn: () => Promise<EarningsCandidate[]>,
): Promise<ProviderResult> {
  try {
    const events = await fn();
    return {
      events,
      status: { source_id, source_name, url, ok: true, events: events.length },
    };
  } catch (err) {
    return {
      events: [],
      status: {
        source_id,
        source_name,
        url,
        ok: false,
        events: 0,
        message: errorMessage(err),
      },
    };
  }
}

export async function fetchEarningsCalendar(
  options: FetchEarningsOptions = {},
): Promise<EarningsCalendarSnapshot> {
  const lookaheadDays =
    options.lookaheadDays ??
    parsePositiveIntEnv("EARNINGS_LOOKAHEAD_DAYS", DEFAULT_LOOKAHEAD_DAYS);
  const maxEvents =
    options.maxEvents ??
    parsePositiveIntEnv("EARNINGS_MAX_EVENTS", DEFAULT_MAX_EVENTS);
  const start = options.startDate ?? todayKey();
  const end = addDaysKey(start, lookaheadDays);
  const overridesPath =
    options.overridesPath ?? path.resolve("earnings.overrides.json");

  const providers = await Promise.all([
    runProvider(
      "overrides",
      "Local earnings overrides",
      "earnings.overrides.json",
      () => fetchOverrides(start, end, overridesPath),
    ),
    runProvider(
      "tsmc-official",
      "TSMC Financial Calendar",
      "https://investor.tsmc.com/english/financial-calendar",
      () => fetchTsmcOfficialCalendar(start, end),
    ),
    runProvider(
      "nasdaq",
      "Nasdaq Earnings Calendar",
      "https://api.nasdaq.com/api/calendar/earnings",
      () => fetchNasdaqCalendar(start, end),
    ),
    runProvider(
      "investing",
      "Investing.com Earnings Calendar",
      "https://www.investing.com/earnings-calendar/",
      () => fetchInvestingCalendar(start, end),
    ),
  ]);

  const candidates = providers.flatMap((provider) => provider.events);
  return {
    window_start: start,
    window_end: end,
    generated_at: new Date().toISOString(),
    lookahead_days: lookaheadDays,
    events: dedupeEarningsCandidates(candidates, maxEvents),
    source_status: providers.map((provider) => provider.status),
  };
}
