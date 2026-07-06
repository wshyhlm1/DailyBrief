import "./_env";

import fs from "node:fs";
import path from "node:path";

import { todayKey } from "../lib/utils";

const OUTPUT_DIR = "daily_reports";

function fail(message: string): never {
  console.error(`[earnings:assert] FAILED: ${message}`);
  process.exit(1);
}

function main() {
  const date = process.argv[2] || todayKey();
  const base = path.join(OUTPUT_DIR, date, date);
  const jsonPath = `${base}.json`;
  const htmlPath = `${base}.html`;

  if (!fs.existsSync(jsonPath)) fail(`missing report JSON: ${jsonPath}`);
  if (!fs.existsSync(htmlPath)) fail(`missing report HTML: ${htmlPath}`);

  const report = JSON.parse(fs.readFileSync(jsonPath, "utf8")) as {
    earnings_calendar?: {
      window_start?: unknown;
      window_end?: unknown;
      events?: unknown;
      source_status?: unknown;
    };
  };
  const snapshot = report.earnings_calendar;
  if (!snapshot) fail(`${jsonPath} does not contain earnings_calendar`);
  if (typeof snapshot.window_start !== "string" || typeof snapshot.window_end !== "string") {
    fail("earnings_calendar is missing window_start/window_end");
  }
  if (!Array.isArray(snapshot.events)) {
    fail("earnings_calendar.events must be an array");
  }
  if (!Array.isArray(snapshot.source_status) || snapshot.source_status.length === 0) {
    fail("earnings_calendar.source_status must contain at least one source");
  }

  const html = fs.readFileSync(htmlPath, "utf8");
  if (!html.includes("earnings-radar")) {
    fail(`${htmlPath} does not contain the earnings radar block`);
  }

  console.log(
    `[earnings:assert] ${date}: earnings calendar present (${snapshot.events.length} event(s), ${snapshot.source_status.length} source(s))`,
  );
}

main();
