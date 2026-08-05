import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSourceBackedFallbackReport,
  generateReportWithFallback,
  type ArticleInput,
} from "./pipeline";


test("source-backed fallback preserves fetched titles, URLs, and excerpts", () => {
  const articles: ArticleInput[] = [
    {
      sourceId: "tech-source",
      source: "Tech Source",
      title: "Verified AI headline",
      url: "https://example.test/tech",
      excerpt: "A source-provided technology excerpt.",
      category: "tech",
    },
    {
      sourceId: "finance-source",
      source: "Finance Source",
      title: "Verified market headline",
      url: "https://example.test/finance",
      excerpt: "A source-provided market excerpt.",
      category: "finance",
    },
    {
      sourceId: "world-source",
      source: "World Source",
      title: "Verified world headline",
      url: "https://example.test/world",
      excerpt: "A source-provided world excerpt.",
      category: "politics",
    },
  ];

  const report = buildSourceBackedFallbackReport(articles);

  assert.equal(report.tech_briefs[0].title, articles[0].title);
  assert.equal(report.tech_briefs[0].url, articles[0].url);
  assert.equal(report.tech_briefs[0].summary, articles[0].excerpt);
  assert.equal(report.finance_briefs[0].url, articles[1].url);
  assert.equal(report.politics_briefs[0].url, articles[2].url);
  assert.match(report.editor_note, /Qwen/);
  assert.match(report.daily_overview, /来源|source/i);
});


test("total Qwen unavailability publishes the source-backed fallback", async () => {
  const articles: ArticleInput[] = [
    {
      sourceId: "tech-source",
      source: "Tech Source",
      title: "Verified AI headline",
      url: "https://example.test/tech",
      excerpt: "A source-provided technology excerpt.",
      category: "tech",
    },
  ];
  let attempts = 0;

  const report = await generateReportWithFallback(
    JSON.stringify(articles),
    articles,
    async () => {
      attempts += 1;
      throw new Error("Connection error");
    },
  );

  assert.equal(attempts, 2);
  assert.equal(report.tech_briefs[0].url, articles[0].url);
  assert.match(report.editor_note, /Qwen/);
});
