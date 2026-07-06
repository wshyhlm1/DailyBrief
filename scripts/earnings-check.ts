import "./_env";

import {
  dedupeEarningsCandidates,
  fetchEarningsCalendar,
  parseInvestingCalendarHtml,
  parseTsmcFinancialCalendarHtml,
} from "../lib/earnings/calendar";
import type { EarningsCandidate } from "../lib/earnings/types";

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

function runFixtureChecks(): void {
  const investingFixture = `
    <tr tablesorterdivider>
      <td colspan="9" class="theDay">Thursday, July 16, 2026</td>
    </tr>
    <tr>
      <td class="flag"><span title="Taiwan" class="ceFlags Taiwan middle"></span></td>
      <td class="left noWrap earnCalCompany" title="Taiwan Semiconductor Manufacturing">
        <span class="earnCalCompanyName middle">Taiwan Semiconductor</span>
        (<a href="/equities/taiwan-semicon-earnings" class="bold middle">2330</a>)
      </td>
      <td>--</td>
      <td class="leftStrong">/&nbsp;&nbsp;23.98</td>
      <td>--</td>
      <td class="leftStrong">/&nbsp;&nbsp;1,263.1B</td>
      <td class="right">63.4T</td>
      <td class="right time" data-value="1">
        <span data-tooltip="Before market open"></span>
      </td>
      <td></td>
    </tr>
    <tr>
      <td class="flag"><span title="United States" class="ceFlags USA middle"></span></td>
      <td class="left noWrap earnCalCompany" title="Made Up Inc">
        <span class="earnCalCompanyName middle">Made Up</span>
        (<a href="/equities/made-up-earnings" class="bold middle">FAKE</a>)
      </td>
      <td>--</td><td class="leftStrong">/&nbsp;&nbsp;--</td>
      <td>--</td><td class="leftStrong">/&nbsp;&nbsp;--</td>
      <td></td><td class="right time" data-value="2"></td><td></td>
    </tr>
  `;

  const investing = parseInvestingCalendarHtml(
    investingFixture,
    "2026-07-16",
    "2026-07-16",
  );
  assert(investing.length === 1, "Investing fixture should keep only watched companies");
  assert(investing[0].company_id === "tsmc", "Investing fixture should map 2330 to TSMC");
  assert(investing[0].eps_estimate === "23.98", "Investing fixture should parse EPS estimate");
  assert(
    investing[0].revenue_estimate === "1,263.1B",
    "Investing fixture should parse revenue estimate",
  );
  assert(
    investing[0].timing === "before_market",
    "Investing fixture should parse timing tooltip",
  );

  const tsmcOfficialFixture = `
    <main>
      <h3>Upcoming Events</h3>
      <p>July 17, 2026 (Fri)</p>
      <p>2026-07-17 14:00:00 2026-07-17 15:30:00 TSMC 2Q'26 Results - Earnings Conference and Conference Call Asia/Taipei public</p>
      <p>TSMC 2Q'26 Results - Earnings Conference and Conference Call</p>
    </main>
  `;
  const official = parseTsmcFinancialCalendarHtml(
    tsmcOfficialFixture,
    "2026-07-16",
    "2026-07-18",
  );
  assert(official.length === 1, "TSMC fixture should parse official result event");
  assert(official[0].report_date === "2026-07-17", "Official fixture date should parse");
  assert(official[0].confirmation_status === "confirmed", "Official fixture should be confirmed");

  const duplicateAdr: EarningsCandidate = {
    ...investing[0],
    ticker: "TSM",
    report_date: "2026-07-16",
    eps_estimate: "3.77",
    revenue_estimate: undefined,
    source: "Nasdaq fixture",
    source_url: "https://example.com/nasdaq",
    source_priority: 60,
  };
  const dedupedSameDate = dedupeEarningsCandidates(
    [investing[0], duplicateAdr],
    12,
  );
  assert(dedupedSameDate.length === 1, "ADR/local duplicate should collapse");
  assert(
    dedupedSameDate[0].eps_estimate === "3.77" &&
      dedupedSameDate[0].revenue_estimate === "1,263.1B",
    "Same-date duplicates should merge EPS and revenue estimates",
  );

  const officialWins = dedupeEarningsCandidates(
    [investing[0], official[0]],
    12,
  );
  assert(officialWins.length === 1, "Official/public duplicate should collapse");
  assert(
    officialWins[0].report_date === "2026-07-17",
    "Official date should override public-calendar date",
  );

  const noEstimate = parseInvestingCalendarHtml(
    investingFixture.replace("23.98", "--").replace("1,263.1B", "--"),
    "2026-07-16",
    "2026-07-16",
  );
  assert(noEstimate.length === 1, "No-estimate fixture should still emit event");
  assert(
    noEstimate[0].eps_estimate === undefined &&
      noEstimate[0].revenue_estimate === undefined,
    "Missing EPS/revenue should stay undefined, not fabricated",
  );
}

async function main() {
  runFixtureChecks();
  console.log("[earnings:check] fixture checks passed");

  if (process.argv.includes("--fixtures-only")) return;

  const snapshot = await fetchEarningsCalendar();
  console.log(
    `[earnings:check] ${snapshot.window_start} → ${snapshot.window_end}: ${snapshot.events.length} watched event(s)`,
  );
  for (const status of snapshot.source_status) {
    const mark = status.ok ? "ok" : "failed";
    const msg = status.message ? ` — ${status.message}` : "";
    console.log(
      `  ${status.source_id.padEnd(14)} ${mark.padEnd(6)} ${status.events} event(s)${msg}`,
    );
  }
  for (const event of snapshot.events) {
    const expectations = [event.eps_estimate && `EPS ${event.eps_estimate}`, event.revenue_estimate && `Revenue ${event.revenue_estimate}`]
      .filter(Boolean)
      .join(" · ");
    console.log(
      `  ${event.report_date} ${event.ticker.padEnd(9)} ${event.company} ${expectations || "no public consensus"}`,
    );
  }

  if (!snapshot.source_status.some((status) => status.ok)) {
    throw new Error("all earnings sources failed");
  }
}

main().catch((e) => {
  console.error("[earnings:check] FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
});
