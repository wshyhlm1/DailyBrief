import { jsonrepair } from "jsonrepair";
import { runLlm } from "./llm";
import { extractJson } from "./json-util";
import { REPORT_LOCALE } from "../sources/registry";

export interface StockHighlightInput {
  url: string;
  title: string;
  excerpt?: string;
  source?: string;
}

export interface StockHighlight {
  symbol: string;
  company?: string;
  source: string;
  url: string;
  view: string;
  target_price?: string;
  reference_price?: string;
  thesis: string;
}

const SYMBOL_RE = /\$([A-Za-z]{1,5}(?:\.[A-Za-z]{1,2})?)/g;
const CN_STOCK_CODE_RE = /(?:^|[^\d])(\d{6})(?:[^\d]|$)/g;

const SYSTEM_PROMPT_ZH = `你是一名中文财经研究助理，负责把 X（Twitter）选股帖抽取成顶部速览表。

输入：多条 X 帖子，每条含 url、title、excerpt、source。

任务：输出当日所有被提及股票/ETF 的结构化要点。每一行对应一个 ticker，同一 ticker 多次出现时合并为一行并保留最重要/最新观点。

字段要求：
  - symbol：股票代码，不带 $，全部大写
  - company：能从上下文识别则填写公司/ETF 名称，否则空字符串
  - source：来源名，通常是 X Serenity
  - url：最能代表该 ticker 观点的原帖 URL，必须从输入复制
  - view：中文短语，客观转述观点，如「看多」「持仓/做多」「观察」「复盘」「风险提示」「仅提及/无明确观点」
  - target_price：仅在原文明确给出目标价、price target、PT、目标市值时填写；没有就留空，绝不编造
  - reference_price：原文出现但不是目标价的价格/区间/市值/涨跌幅，如「~$20-30」「$1.28B 市值」「-4.95%」
  - thesis：30-90 字中文，翻译并压缩核心逻辑、催化剂、风险或备注

规则：
  - 必须把英文/日文等非中文观点翻译成中文
  - 保留股票代码、金额、百分比、估值、市值、日期
  - 区分目标价和参考价：买入成本、当前价格、历史涨幅、市值不是目标价
  - 不提供投资建议，只整理原帖观点

输出严格 JSON 对象，不要 markdown：
{
  "highlights": [
    {
      "symbol": "AAOI",
      "company": "",
      "source": "X Serenity (@aleabitoreddit)",
      "url": "https://x.com/...",
      "view": "复盘/看多",
      "target_price": "",
      "reference_price": "~$20-30",
      "thesis": "..."
    }
  ]
}`;

const SYSTEM_PROMPT_EN = `You are a financial research assistant extracting X (Twitter) stock-pick posts into a top summary table.

Input: X posts with url, title, excerpt, and source.

Task: output structured highlights for every mentioned stock/ETF. One row per ticker; merge duplicate tickers and keep the most important/latest view.

Fields:
  - symbol: uppercase ticker without $
  - company: company/ETF name if identifiable, otherwise empty string
  - source: source name, usually X Serenity
  - url: source post URL copied from input
  - view: concise English phrase such as "bullish", "long/position", "watch", "recap", "risk note", "mentioned/no clear view"
  - target_price: only if the source explicitly states a price target, PT, target price, or target market cap; otherwise empty
  - reference_price: prices/ranges/market caps/moves mentioned but not targets, e.g. "~$20-30", "$1.28B market cap", "-4.95%"
  - thesis: 30-90 word English summary of the core rationale, catalyst, risk, or note

Rules:
  - Translate any non-English text into English
  - Preserve tickers, dollar amounts, percentages, valuations, market caps, and dates
  - Distinguish target price from reference price: cost basis, current price, historical moves, and market cap are not target prices unless stated as targets
  - Do not give investment advice; summarize the source's view neutrally

Output STRICTLY a JSON object, no markdown:
{
  "highlights": [
    {
      "symbol": "AAOI",
      "company": "",
      "source": "X Serenity (@aleabitoreddit)",
      "url": "https://x.com/...",
      "view": "recap/bullish",
      "target_price": "",
      "reference_price": "~$20-30",
      "thesis": "..."
    }
  ]
}`;

const SYSTEM_PROMPT = REPORT_LOCALE === "en" ? SYSTEM_PROMPT_EN : SYSTEM_PROMPT_ZH;

function normalizeSymbol(symbol: string): string {
  return symbol.replace(/^\$/, "").toUpperCase();
}

function inferFallbackView(text: string): string {
  if (/short(?:ing)? .*lost|underwater|infinite losses|空头.*亏|空头.*挤|逼空/i.test(text)) {
    return REPORT_LOCALE === "en" ? "bullish / short squeeze" : "看多/空头挤压";
  }
  if (/long|averaging up|took positions?|position|compelling|conviction|bull|bullish|upside|mispriced|going much higher|double|triple|看多|看好|做多|持仓|加仓|低估|错价|重估|最青睐|方向性做多/i.test(text)) {
    return REPORT_LOCALE === "en" ? "positive/long framing" : "看多";
  }
  if (/short|selloff|risk|cut|down|bear|看空|风险|减仓/i.test(text)) {
    return REPORT_LOCALE === "en" ? "risk / downside mention" : "风险提示";
  }
  return REPORT_LOCALE === "en" ? "mentioned; no clear view" : "仅提及/无明确观点";
}

function extractReferencePrices(text: string): string {
  const matches =
    text.match(
      /~?\$[\d,.]+(?:\s?[-–]\s?\$?[\d,.]+)?(?:\s?[KMBT万亿]*)?|\b\d+(?:\.\d+)?%|\b\d+(?:\.\d+)?\s?[万亿]人民币/gi,
    ) ?? [];
  return Array.from(new Set(matches)).slice(0, 4).join(", ");
}

function fallbackSymbols(text: string): string[] {
  const symbols = new Set<string>();
  for (const match of text.matchAll(SYMBOL_RE)) {
    symbols.add(normalizeSymbol(match[1]));
  }
  for (const match of text.matchAll(CN_STOCK_CODE_RE)) {
    symbols.add(normalizeSymbol(match[1]));
  }
  return Array.from(symbols);
}

function fallbackThesis(symbol: string, item: StockHighlightInput): string {
  const source = (item.excerpt || item.title)
    .replace(/\s+/g, " ")
    .replace(/<[^>]+>/g, "")
    .trim();
  if (REPORT_LOCALE === "en") {
    const snippet = source.slice(0, 260);
    return snippet || `Source post mentions ${symbol}; open the original post for the full context.`;
  }
  const snippet = source.slice(0, 118);
  return snippet
    ? `${symbol}：${snippet}`
    : `原帖提及 ${symbol}；请打开原文查看完整上下文。`;
}

function fallbackHighlights(items: StockHighlightInput[]): StockHighlight[] {
  const bySymbol = new Map<string, StockHighlight>();
  for (const item of items) {
    const text = `${item.title}\n${item.excerpt ?? ""}`;
    for (const symbol of fallbackSymbols(text)) {
      if (bySymbol.has(symbol)) continue;
      bySymbol.set(symbol, {
        symbol,
        company: "",
        source: item.source ?? "",
        url: item.url,
        view: inferFallbackView(text),
        target_price: "",
        reference_price: extractReferencePrices(text),
        thesis: fallbackThesis(symbol, item),
      });
    }
  }
  return Array.from(bySymbol.values());
}

function normalizeHighlights(
  parsed: { highlights?: StockHighlight[] },
): StockHighlight[] {
  const seen = new Set<string>();
  const out: StockHighlight[] = [];
  for (const h of parsed.highlights ?? []) {
    const symbol = normalizeSymbol(String(h.symbol ?? ""));
    if (!symbol || seen.has(symbol)) continue;
    if (!h.url || !h.thesis) continue;
    seen.add(symbol);
    out.push({
      symbol,
      company: (h.company ?? "").trim(),
      source: (h.source ?? "").trim(),
      url: h.url,
      view: (h.view ?? "").trim(),
      target_price: (h.target_price ?? "").trim(),
      reference_price: (h.reference_price ?? "").trim(),
      thesis: h.thesis.trim(),
    });
  }
  return out;
}

export async function generateStockHighlights(
  items: StockHighlightInput[],
): Promise<StockHighlight[]> {
  if (items.length === 0) return [];
  const payload = items.map((item) => ({
    url: item.url,
    title: item.title,
    source: item.source ?? "",
    excerpt: (item.excerpt ?? "").slice(0, 700),
  }));
  const userPrompt = [
    REPORT_LOCALE === "en"
      ? "**Output language: ENGLISH ONLY.** All view/thesis strings must be English."
      : "**输出语言：仅中文。** view 和 thesis 必须是中文；ticker、金额、百分比保留原样。",
    "",
    `X stock-pick posts (${payload.length} entries, JSON array):`,
    JSON.stringify(payload),
    "",
    REPORT_LOCALE === "en"
      ? `Output {"highlights": [...]} only.`
      : `只输出 {"highlights": [...]}。`,
  ].join("\n");

  try {
    const { text } = await runLlm({
      systemPrompt: SYSTEM_PROMPT,
      userPrompt,
      timeoutMs: 240_000,
    });
    const cleaned = extractJson(text);
    let parsed: { highlights?: StockHighlight[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = JSON.parse(jsonrepair(cleaned));
    }
    const highlights = normalizeHighlights(parsed);
    return highlights.length > 0 ? highlights : fallbackHighlights(items);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(`[stock-highlights] generation failed: ${msg}`);
    return fallbackHighlights(items);
  }
}
