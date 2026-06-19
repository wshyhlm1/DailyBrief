#!/usr/bin/env node
/**
 * Build the static site that gets published to GitHub Pages (or any static
 * host). Run AFTER `npm run daily` has produced today's report.
 *
 * Writes into daily_reports/ (already the publish dir):
 *   - index.html      copy of the latest <date>/<date>.html
 *   - archive.html    table of every <date>/<date>.html, newest first
 *   - optional encrypted wrappers when DAILY_BRIEF_PASSWORD is set
 *
 * Existing per-date subdirs are left untouched. Idempotent — safe to re-run.
 *
 * Usage:
 *   node scripts/build-site.mjs
 */

import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import zlib from "node:zlib";

// Match scripts/_env.ts for local runs: .env.local wins, .env is fallback.
config({ path: ".env.local", quiet: true });
config({ path: ".env", quiet: true });

const ROOT = "daily_reports";
const ENCRYPTED_MARKER = 'data-daily-brief-encrypted="v1"';
const DEFAULT_REMEMBER_DAYS = 45;
const DEFAULT_KDF_ITERATIONS = 150000;

const accessPassword =
  process.env.DAILY_BRIEF_PASSWORD || process.env.DAILY_BRIEF_ACCESS_PASSWORD || "";
const rememberDays = parsePositiveNumber(
  process.env.DAILY_BRIEF_REMEMBER_DAYS,
  DEFAULT_REMEMBER_DAYS,
);
const kdfIterations = Math.max(
  10000,
  Math.floor(
    parsePositiveNumber(process.env.DAILY_BRIEF_KDF_ITERATIONS, DEFAULT_KDF_ITERATIONS),
  ),
);

function parsePositiveNumber(raw, fallback) {
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toBase64(bytes) {
  return Buffer.from(bytes).toString("base64");
}

function isEncryptedHtml(html) {
  return html.slice(0, 1024).includes(ENCRYPTED_MARKER);
}

function decryptHtmlDocument(html, password) {
  if (!isEncryptedHtml(html)) return html;
  if (!password) throw new Error("the report is encrypted but no password is available");

  const assignment = "var encrypted = ";
  const start = html.indexOf(assignment);
  if (start === -1) throw new Error("encrypted payload metadata is missing");
  const jsonStart = start + assignment.length;
  const jsonEnd = html.indexOf(";", jsonStart);
  if (jsonEnd === -1) throw new Error("encrypted payload metadata is malformed");

  const meta = JSON.parse(html.slice(jsonStart, jsonEnd));
  const sealed = Buffer.from(meta.payload, "base64");
  if (sealed.length <= 16) throw new Error("encrypted payload is too short");

  const key = crypto.pbkdf2Sync(
    password,
    Buffer.from(meta.salt, "base64"),
    meta.iterations,
    32,
    "sha256",
  );
  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(meta.iv, "base64"),
  );
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  return Buffer.concat([
    decipher.update(sealed.subarray(0, sealed.length - 16)),
    decipher.final(),
  ]).toString("utf8");
}

function decodeHtmlEntities(value) {
  const named = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const isHex = entity[1]?.toLowerCase() === "x";
      const codePoint = Number.parseInt(entity.slice(isHex ? 2 : 1), isHex ? 16 : 10);
      if (Number.isFinite(codePoint)) {
        try {
          return String.fromCodePoint(codePoint);
        } catch {
          return match;
        }
      }
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function htmlToSearchText(html) {
  const withoutNonContent = html
    .replace(/<!--([\s\S]*?)-->/g, " ")
    .replace(/<(script|style|noscript|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<\/?(?:article|aside|blockquote|br|dd|div|dl|dt|footer|h[1-6]|header|li|main|nav|p|section|table|td|th|tr|ul)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeHtmlEntities(withoutNonContent)
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

function collectJsonStrings(value, out = []) {
  if (typeof value === "string") {
    const text = value.trim();
    if (text) out.push(text);
  } else if (Array.isArray(value)) {
    for (const item of value) collectJsonStrings(item, out);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectJsonStrings(item, out);
  }
  return out;
}

function buildSearchDocument(date, htmlFile) {
  const publishedHtml = fs.readFileSync(htmlFile, "utf8");
  const plainHtml = decryptHtmlDocument(publishedHtml, accessPassword);
  const reportJsonFile = path.join(ROOT, date, `${date}.json`);
  let headline = "";
  let reportText = "";

  if (fs.existsSync(reportJsonFile)) {
    try {
      const report = JSON.parse(fs.readFileSync(reportJsonFile, "utf8"));
      headline = typeof report.hero_headline === "string" ? report.hero_headline.trim() : "";
      reportText = collectJsonStrings(report).join("\n");
    } catch (error) {
      console.warn(`[build-site] search: could not read ${date}.json (${error.message})`);
    }
  }

  return {
    date,
    title: headline || `Daily Brief · ${date}`,
    text: `${htmlToSearchText(plainHtml)}\n${reportText}`.trim(),
    bytes: Buffer.byteLength(plainHtml),
  };
}

function buildSearchIndexEnvelope(docs, password) {
  const compressed = zlib.gzipSync(JSON.stringify(docs), { level: 9 });
  if (!password) {
    return {
      v: 1,
      encoding: "gzip+json",
      encrypted: false,
      payload: compressed.toString("base64"),
    };
  }

  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, kdfIterations, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  return {
    v: 1,
    encoding: "gzip+json",
    encrypted: true,
    iterations: kdfIterations,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    payload: Buffer.concat([ciphertext, cipher.getAuthTag()]).toString("base64"),
  };
}

function archiveGroupsHtml(dates, docsByDate) {
  const years = new Map();
  for (const date of dates) {
    const [year, month] = date.split("-");
    if (!years.has(year)) years.set(year, new Map());
    const months = years.get(year);
    if (!months.has(month)) months.set(month, []);
    months.get(month).push(date);
  }

  return Array.from(years, ([year, months]) => {
    const monthBlocks = Array.from(months, ([month, monthDates]) => {
      const monthNumber = Number.parseInt(month, 10);
      const rows = monthDates
        .map((date) => {
          const doc = docsByDate.get(date);
          const bytes = doc?.bytes ?? fs.statSync(path.join(ROOT, date, `${date}.html`)).size;
          const size = (bytes / 1024).toFixed(0);
          return `          <li><a href="./${date}/${date}.html"><time datetime="${date}">${date}</time><span class="report-title">${escapeHtml(doc?.title ?? "")}</span></a><span class="size">${size} KB</span></li>`;
        })
        .join("\n");
      return `      <section class="month-group" id="archive-${year}-${month}">
        <header class="month-heading"><h3>${monthNumber} 月</h3><span>${monthDates.length} 份</span></header>
        <ul>
${rows}
        </ul>
      </section>`;
    }).join("\n");

    return `    <section class="year-group" id="archive-${year}">
      <h2>${year} 年</h2>
      <div class="months">${monthBlocks}</div>
    </section>`;
  }).join("\n");
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function encryptHtmlDocument(html, password, sourcePath) {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(password, salt, kdfIterations, 32, "sha256");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(html, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return renderEncryptedShell({
    sourcePath,
    rememberDays,
    kdfIterations,
    salt: toBase64(salt),
    iv: toBase64(iv),
    payload: toBase64(Buffer.concat([ciphertext, authTag])),
  });
}

function renderEncryptedShell(meta) {
  const payloadJson = JSON.stringify({
    v: 1,
    sourcePath: meta.sourcePath,
    rememberDays: meta.rememberDays,
    iterations: meta.kdfIterations,
    salt: meta.salt,
    iv: meta.iv,
    payload: meta.payload,
  });

  return `<!doctype html>
<html lang="zh-CN" ${ENCRYPTED_MARKER}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow, noarchive">
<title>Daily Brief · Locked</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    min-height: 100vh;
    margin: 0;
    display: grid;
    place-items: center;
    padding: 1.25rem;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
    background:
      radial-gradient(circle at top left, rgba(37, 99, 235, 0.16), transparent 32rem),
      linear-gradient(135deg, #f8fafc, #eef2ff);
    color: #111827;
  }
  .card {
    width: min(100%, 28rem);
    padding: 1.7rem;
    border: 1px solid rgba(148, 163, 184, 0.35);
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.86);
    box-shadow: 0 24px 70px rgba(15, 23, 42, 0.14);
    backdrop-filter: blur(14px);
  }
  .eyebrow {
    margin: 0 0 0.35rem;
    color: #64748b;
    font-size: 0.76rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }
  h1 {
    margin: 0;
    font-size: 1.65rem;
    line-height: 1.15;
    letter-spacing: -0.03em;
  }
  .hint {
    margin: 0.8rem 0 1.2rem;
    color: #475569;
    font-size: 0.94rem;
    line-height: 1.65;
  }
  label { display: block; margin-bottom: 0.4rem; font-size: 0.9rem; font-weight: 650; }
  input[type="password"] {
    width: 100%;
    padding: 0.82rem 0.9rem;
    border: 1px solid #cbd5e1;
    border-radius: 0.7rem;
    background: #fff;
    color: #111827;
    font: inherit;
  }
  input[type="password"]:focus {
    outline: 2px solid rgba(37, 99, 235, 0.26);
    border-color: #2563eb;
  }
  .remember {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.85rem 0 1rem;
    color: #475569;
    font-size: 0.88rem;
    font-weight: 500;
  }
  .remember input { width: 1rem; height: 1rem; }
  button {
    width: 100%;
    border: 0;
    border-radius: 0.7rem;
    padding: 0.82rem 1rem;
    background: #111827;
    color: #fff;
    cursor: pointer;
    font: inherit;
    font-weight: 700;
  }
  button:disabled { cursor: wait; opacity: 0.7; }
  .status {
    min-height: 1.4rem;
    margin-top: 0.85rem;
    color: #64748b;
    font-size: 0.86rem;
  }
  .status.error { color: #b91c1c; }
  .fine-print {
    margin: 1rem 0 0;
    color: #94a3b8;
    font-size: 0.76rem;
    line-height: 1.55;
  }
  @media (prefers-color-scheme: dark) {
    body {
      background:
        radial-gradient(circle at top left, rgba(96, 165, 250, 0.18), transparent 32rem),
        linear-gradient(135deg, #020617, #111827);
      color: #f8fafc;
    }
    .card {
      border-color: rgba(148, 163, 184, 0.22);
      background: rgba(15, 23, 42, 0.82);
      box-shadow: 0 24px 70px rgba(0, 0, 0, 0.35);
    }
    .eyebrow,
    .hint,
    .remember,
    .status { color: #cbd5e1; }
    input[type="password"] {
      border-color: #334155;
      background: #020617;
      color: #f8fafc;
    }
    button { background: #f8fafc; color: #020617; }
    .fine-print { color: #94a3b8; }
    .status.error { color: #fca5a5; }
  }
</style>
</head>
<body>
  <form class="card" id="unlock-form">
    <p class="eyebrow">Daily Brief</p>
    <h1>输入共享密码</h1>
    <p class="hint">这份简报已在发布前静态加密。</p>
    <label for="password">密码</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
    <label class="remember">
      <input id="remember" type="checkbox" checked>
      <span>记住密码</span>
    </label>
    <button id="unlock-button" type="submit">打开简报</button>
    <div class="status" id="status" aria-live="polite"></div>
    <p class="fine-print">这是基础访问验证：密码不会发送到服务器，只在浏览器本地用于解密页面。</p>
  </form>
<script>
(function () {
  "use strict";
  var encrypted = ${payloadJson};
  var storageKey = "daily-brief:password:v1";
  var form = document.getElementById("unlock-form");
  var input = document.getElementById("password");
  var remember = document.getElementById("remember");
  var button = document.getElementById("unlock-button");
  var status = document.getElementById("status");
  var decoder = new TextDecoder();
  var encoder = new TextEncoder();

  function setStatus(message, isError) {
    status.textContent = message || "";
    status.classList.toggle("error", Boolean(isError));
  }

  function b64ToBytes(value) {
    var binary = atob(value);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function readRememberedPassword() {
    try {
      var raw = localStorage.getItem(storageKey);
      if (!raw) return "";
      var saved = JSON.parse(raw);
      if (!saved || !saved.password || !saved.expiresAt || saved.expiresAt <= Date.now()) {
        localStorage.removeItem(storageKey);
        return "";
      }
      return saved.password;
    } catch (_) {
      return "";
    }
  }

  function rememberPassword(password) {
    if (!remember.checked) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          password: password,
          expiresAt: Date.now() + encrypted.rememberDays * 24 * 60 * 60 * 1000,
        }),
      );
    } catch (_) {
      // Browsers can disable localStorage; unlocking should still work.
    }
  }

  async function deriveKey(password) {
    var baseKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      {
        name: "PBKDF2",
        salt: b64ToBytes(encrypted.salt),
        iterations: encrypted.iterations,
        hash: "SHA-256",
      },
      baseKey,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
  }

  async function decrypt(password) {
    var key = await deriveKey(password);
    var plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: b64ToBytes(encrypted.iv) },
      key,
      b64ToBytes(encrypted.payload),
    );
    return decoder.decode(plain);
  }

  async function unlock(password, automatic) {
    if (!window.crypto || !crypto.subtle) {
      setStatus("当前浏览器不支持 Web Crypto，无法解密页面。", true);
      return;
    }
    button.disabled = true;
    setStatus(automatic ? "正在使用已保存的密码打开…" : "正在解密…", false);
    try {
      var html = await decrypt(password);
      rememberPassword(password);
      window.__DAILY_BRIEF_PASSWORD = password;
      document.open();
      document.write(html);
      document.close();
    } catch (error) {
      if (automatic) {
        try { localStorage.removeItem(storageKey); } catch (_) {}
      }
      button.disabled = false;
      setStatus("密码不对，或者这份简报使用了不同的旧密码。", true);
      input.focus();
      input.select();
    }
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    unlock(input.value, false);
  });

  var savedPassword = readRememberedPassword();
  if (savedPassword) {
    unlock(savedPassword, true);
  }
})();
</script>
</body>
</html>
`;
}

function listHtmlFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...listHtmlFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".html")) {
      out.push(fullPath);
    }
  }
  return out;
}

function encryptSiteHtml(root, password) {
  const htmlFiles = listHtmlFiles(root);
  let encryptedCount = 0;
  let skippedCount = 0;

  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    if (isEncryptedHtml(html)) {
      skippedCount += 1;
      continue;
    }

    const relativePath = path.relative(root, file).replaceAll(path.sep, "/");
    fs.writeFileSync(file, encryptHtmlDocument(html, password, relativePath), "utf8");
    encryptedCount += 1;
  }

  fs.writeFileSync(
    path.join(root, "robots.txt"),
    "User-agent: *\nDisallow: /\n",
    "utf8",
  );
  console.log(
    `[build-site] encrypted ${encryptedCount} html file${encryptedCount === 1 ? "" : "s"} ` +
      `(${skippedCount} already encrypted, remember ${rememberDays}d)`,
  );
  console.log("[build-site] robots.txt (disallow all crawlers)");
}

if (!fs.existsSync(ROOT)) {
  console.error(`[build-site] ${ROOT}/ doesn't exist — run \`npm run daily\` first.`);
  process.exit(1);
}

// Pick up every <YYYY-MM-DD>/<YYYY-MM-DD>.html, newest first.
const dates = fs
  .readdirSync(ROOT)
  .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d))
  .filter((d) => fs.existsSync(path.join(ROOT, d, `${d}.html`)))
  .sort((a, b) => b.localeCompare(a));

if (dates.length === 0) {
  console.error(`[build-site] no <YYYY-MM-DD>/<YYYY-MM-DD>.html found in ${ROOT}/`);
  process.exit(1);
}

// --- index.html = latest report ---
const latest = dates[0];
const latestPath = path.join(ROOT, latest, `${latest}.html`);
const latestHtml = fs.readFileSync(latestPath, "utf8");
const indexHtml = isEncryptedHtml(latestHtml)
  ? latestHtml
  : latestHtml.replaceAll('href="../archive.html"', 'href="./archive.html"');
fs.writeFileSync(path.join(ROOT, "index.html"), indexHtml, "utf8");
console.log(`[build-site] index.html  ← ${latest}/${latest}.html`);

// --- archive.html = year/month archive + encrypted in-page search index ---
const searchDocs = [];
for (const date of dates) {
  const reportFile = path.join(ROOT, date, `${date}.html`);
  try {
    searchDocs.push(buildSearchDocument(date, reportFile));
  } catch (error) {
    console.warn(`[build-site] search: skipped content for ${date} (${error.message})`);
    searchDocs.push({
      date,
      title: `Daily Brief · ${date}`,
      text: "",
      bytes: fs.statSync(reportFile).size,
    });
  }
}
const docsByDate = new Map(searchDocs.map((doc) => [doc.date, doc]));
const archiveGroups = archiveGroupsHtml(dates, docsByDate);
const searchIndex = buildSearchIndexEnvelope(
  searchDocs.map(({ date, title, text }) => ({ date, title, text })),
  accessPassword,
);
fs.writeFileSync(
  path.join(ROOT, "search-index.json"),
  JSON.stringify(searchIndex),
  "utf8",
);

const archiveHtml = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Daily Brief · 历史归档与搜索</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root {
    color-scheme: light dark;
    --bg: #f6f7f9;
    --surface: #fff;
    --text: #171717;
    --muted: #6b7280;
    --line: #e5e7eb;
    --accent: #0f766e;
    --accent-soft: #d9f4ef;
    --mark: #fef08a;
  }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    max-width: 880px;
    margin: 0 auto;
    padding: 3rem 1.25rem 5rem;
    line-height: 1.6;
    background: var(--bg);
    color: var(--text);
  }
  a { color: inherit; }
  h1 { margin: 0; font-size: clamp(1.75rem, 5vw, 2.5rem); letter-spacing: -0.04em; }
  .eyebrow { margin: 0 0 0.25rem; color: var(--accent); font-size: 0.76rem; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; }
  .meta { margin: 0.4rem 0 0; color: var(--muted); font-size: 0.9rem; }
  .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem; margin-bottom: 1.75rem; }
  .latest-link { flex: 0 0 auto; margin-top: 0.35rem; color: var(--accent); font-size: 0.9rem; font-weight: 700; text-decoration: none; }
  .latest-link:hover { text-decoration: underline; }
  .search-panel {
    margin-bottom: 2rem;
    padding: 1rem;
    border: 1px solid var(--line);
    border-radius: 0.9rem;
    background: var(--surface);
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.05);
  }
  .search-row { display: flex; gap: 0.65rem; }
  .search-input {
    width: 100%;
    min-width: 0;
    padding: 0.8rem 0.9rem;
    border: 1px solid var(--line);
    border-radius: 0.65rem;
    background: transparent;
    color: var(--text);
    font: inherit;
  }
  .search-input:focus { outline: 2px solid color-mix(in srgb, var(--accent) 28%, transparent); border-color: var(--accent); }
  .clear-button { flex: 0 0 auto; border: 0; border-radius: 0.65rem; padding: 0 0.9rem; background: var(--accent-soft); color: var(--accent); cursor: pointer; font: inherit; font-weight: 700; white-space: nowrap; }
  .clear-button[hidden] { display: none; }
  .search-hint, .search-status { margin: 0.55rem 0 0; color: var(--muted); font-size: 0.82rem; }
  .search-status { font-weight: 650; }
  .year-group { margin-top: 2rem; }
  .year-group > h2 { margin: 0 0 0.8rem; font-size: 1.2rem; }
  .months { display: grid; gap: 1rem; }
  .month-group { border: 1px solid var(--line); border-radius: 0.9rem; overflow: hidden; background: var(--surface); }
  .month-heading { display: flex; justify-content: space-between; align-items: center; padding: 0.7rem 1rem; border-bottom: 1px solid var(--line); background: color-mix(in srgb, var(--surface) 80%, var(--accent-soft)); }
  .month-heading h3 { margin: 0; font-size: 1rem; }
  .month-heading span { color: var(--muted); font-size: 0.78rem; }
  ul { list-style: none; padding: 0; }
  .month-group ul { margin: 0; }
  .month-group li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
    padding: 0.72rem 1rem;
    border-bottom: 1px solid var(--line);
  }
  .month-group li:last-child { border-bottom: 0; }
  .month-group li a { min-width: 0; display: grid; grid-template-columns: 6.5rem minmax(0, 1fr); gap: 0.8rem; align-items: baseline; text-decoration: none; }
  .month-group li a:hover time { color: var(--accent); text-decoration: underline; }
  .month-group time { font-weight: 750; font-variant-numeric: tabular-nums; }
  .report-title { overflow: hidden; color: var(--muted); font-size: 0.86rem; text-overflow: ellipsis; white-space: nowrap; }
  .size { flex: 0 0 auto; color: var(--muted); font-size: 0.78rem; }
  .search-results { display: grid; gap: 0.8rem; }
  .result-card { display: block; padding: 1rem; border: 1px solid var(--line); border-radius: 0.85rem; background: var(--surface); text-decoration: none; }
  .result-card:hover { border-color: var(--accent); box-shadow: 0 8px 22px rgba(15, 118, 110, 0.08); }
  .result-date { color: var(--accent); font-size: 0.8rem; font-weight: 800; font-variant-numeric: tabular-nums; }
  .result-title { margin: 0.2rem 0 0.35rem; font-size: 1rem; }
  .result-snippet { margin: 0; color: var(--muted); font-size: 0.86rem; line-height: 1.65; }
  mark { border-radius: 0.18rem; padding: 0 0.08em; background: var(--mark); color: #422006; }
  .empty-results { padding: 2rem 1rem; border: 1px dashed var(--line); border-radius: 0.85rem; color: var(--muted); text-align: center; }
  [hidden] { display: none !important; }
  @media (max-width: 600px) {
    body { padding-top: 1.75rem; }
    .top { display: block; }
    .latest-link { display: inline-block; margin-top: 0.75rem; }
    .month-group li a { grid-template-columns: 1fr; gap: 0.05rem; }
    .report-title { max-width: 60vw; }
  }
  @media (prefers-color-scheme: dark) {
    :root { --bg: #090d14; --surface: #111827; --text: #f3f4f6; --muted: #9ca3af; --line: #263244; --accent: #5eead4; --accent-soft: #123c38; --mark: #fde047; }
    .search-panel { box-shadow: none; }
  }
</style>
</head>
<body>
  <header class="top">
    <div>
      <p class="eyebrow">Daily Brief</p>
      <h1>历史归档与搜索</h1>
      <p class="meta">共 ${dates.length} 份日报 · 按年月归档 · 更新于 ${new Date().toISOString().slice(0, 10)}</p>
    </div>
    <a class="latest-link" href="./index.html">查看最新日报 →</a>
  </header>
  <section class="search-panel" aria-label="跨日报搜索">
    <div class="search-row">
      <input class="search-input" id="archive-search" type="search" placeholder="搜索关键词或股票代码，如 AI、英伟达、NVDA" autocomplete="off" spellcheck="false">
      <button class="clear-button" id="clear-search" type="button" hidden>清除</button>
    </div>
    <p class="search-hint">搜索范围包含日报总览、标题、摘要、原始资讯、股票代码及市场行情。</p>
    <p class="search-status" id="search-status" aria-live="polite"></p>
  </section>
  <main id="archive-groups">
${archiveGroups}
  </main>
  <section class="search-results" id="search-results" aria-label="搜索结果" hidden></section>
  <script>
  (function () {
    "use strict";
    var input = document.getElementById("archive-search");
    var clearButton = document.getElementById("clear-search");
    var groups = document.getElementById("archive-groups");
    var results = document.getElementById("search-results");
    var status = document.getElementById("search-status");
    var renderVersion = 0;
    var docsPromise;

    function b64ToBytes(value) {
      var binary = atob(value);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return bytes;
    }

    function availablePassword() {
      if (window.__DAILY_BRIEF_PASSWORD) return window.__DAILY_BRIEF_PASSWORD;
      try {
        var saved = JSON.parse(localStorage.getItem("daily-brief:password:v1") || "null");
        if (saved && saved.password && saved.expiresAt > Date.now()) return saved.password;
      } catch (_) {}
      return "";
    }

    async function decryptSearchIndex(envelope) {
      if (!envelope.encrypted) return b64ToBytes(envelope.payload);
      var password = availablePassword();
      if (!password) throw new Error("搜索索引需要访问密码，请刷新页面并重新解锁。");
      var baseKey = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveKey"],
      );
      var key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: b64ToBytes(envelope.salt), iterations: envelope.iterations, hash: "SHA-256" },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      );
      var plain = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: b64ToBytes(envelope.iv) },
        key,
        b64ToBytes(envelope.payload),
      );
      window.__DAILY_BRIEF_PASSWORD = undefined;
      return new Uint8Array(plain);
    }

    async function loadSearchDocs() {
      if (typeof DecompressionStream === "undefined") {
        throw new Error("当前浏览器版本不支持历史搜索，请升级浏览器后重试。");
      }
      var response = await fetch("./search-index.json", { cache: "no-store" });
      if (!response.ok) throw new Error("搜索索引加载失败（HTTP " + response.status + "）");
      var envelope = await response.json();
      var bytes = await decryptSearchIndex(envelope);
      var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
      return JSON.parse(await new Response(stream).text());
    }

    function termsFor(value) {
      return Array.from(new Set(value.trim().toLocaleLowerCase().split(/\\s+/).filter(Boolean).map(function (term) {
        return /^\\$[a-z]{1,6}(?:\\.[a-z]{1,2})?$/.test(term) ? term.slice(1) : term;
      })));
    }

    function occurrenceCount(text, term) {
      var count = 0;
      var cursor = 0;
      while ((cursor = text.indexOf(term, cursor)) !== -1) {
        count += 1;
        cursor += Math.max(1, term.length);
      }
      return count;
    }

    function snippetFor(text, terms) {
      var lower = text.toLocaleLowerCase();
      var first = -1;
      terms.forEach(function (term) {
        var position = lower.indexOf(term);
        if (position !== -1 && (first === -1 || position < first)) first = position;
      });
      if (first === -1) return text.slice(0, 220);
      var start = Math.max(0, first - 85);
      var end = Math.min(text.length, first + 175);
      return (start > 0 ? "…" : "") + text.slice(start, end).replace(/\\s+/g, " ").trim() + (end < text.length ? "…" : "");
    }

    function appendHighlighted(target, text, terms) {
      var cursor = 0;
      var lower = text.toLocaleLowerCase();
      while (cursor < text.length) {
        var nextAt = -1;
        var nextTerm = "";
        terms.forEach(function (term) {
          var position = lower.indexOf(term, cursor);
          if (position !== -1 && (nextAt === -1 || position < nextAt)) {
            nextAt = position;
            nextTerm = term;
          }
        });
        if (nextAt === -1) {
          target.appendChild(document.createTextNode(text.slice(cursor)));
          break;
        }
        if (nextAt > cursor) target.appendChild(document.createTextNode(text.slice(cursor, nextAt)));
        var mark = document.createElement("mark");
        mark.textContent = text.slice(nextAt, nextAt + nextTerm.length);
        target.appendChild(mark);
        cursor = nextAt + nextTerm.length;
      }
    }

    async function render() {
      var version = ++renderVersion;
      var query = input.value.trim();
      var terms = termsFor(query);
      clearButton.hidden = !query;
      if (terms.length === 0) {
        groups.hidden = false;
        results.hidden = true;
        results.replaceChildren();
        status.textContent = "";
        history.replaceState(null, "", location.pathname + location.hash);
        return;
      }

      status.textContent = "正在搜索…";
      var docs;
      try {
        if (!docsPromise) docsPromise = loadSearchDocs();
        docs = await docsPromise;
      } catch (error) {
        if (version !== renderVersion) return;
        groups.hidden = true;
        results.hidden = false;
        results.innerHTML = '<div class="empty-results"></div>';
        results.firstElementChild.textContent = error.message || "搜索索引加载失败";
        status.textContent = "搜索不可用";
        return;
      }
      if (version !== renderVersion) return;

      var hits = docs.map(function (doc) {
        var text = doc.text || "";
        var normalized = text.toLocaleLowerCase();
        var title = (doc.title || "").toLocaleLowerCase();
        if (!terms.every(function (term) { return normalized.includes(term) || title.includes(term); })) return null;
        var score = terms.reduce(function (total, term) {
          return total + occurrenceCount(normalized, term) + occurrenceCount(title, term) * 5;
        }, 0);
        return { doc: doc, score: score };
      }).filter(Boolean).sort(function (a, b) {
        return b.score - a.score || b.doc.date.localeCompare(a.doc.date);
      });

      results.replaceChildren();
      hits.forEach(function (hit) {
        var doc = hit.doc;
        var card = document.createElement("a");
        card.className = "result-card";
        card.href = "./" + doc.date + "/" + doc.date + ".html";
        var date = document.createElement("div");
        date.className = "result-date";
        date.textContent = doc.date;
        var title = document.createElement("h2");
        title.className = "result-title";
        title.textContent = doc.title || ("Daily Brief · " + doc.date);
        var snippet = document.createElement("p");
        snippet.className = "result-snippet";
        appendHighlighted(snippet, snippetFor(doc.text || doc.title || "", terms), terms);
        card.append(date, title, snippet);
        results.appendChild(card);
      });
      if (hits.length === 0) {
        var empty = document.createElement("div");
        empty.className = "empty-results";
        empty.textContent = "没有找到包含“" + query + "”的历史日报";
        results.appendChild(empty);
      }
      groups.hidden = true;
      results.hidden = false;
      status.textContent = "找到 " + hits.length + " 个匹配日期";
      var url = new URL(location.href);
      url.searchParams.set("q", query);
      history.replaceState(null, "", url.pathname + url.search + url.hash);
    }

    input.addEventListener("input", render);
    clearButton.addEventListener("click", function () { input.value = ""; render(); input.focus(); });
    var initialQuery = new URL(location.href).searchParams.get("q");
    if (initialQuery) { input.value = initialQuery; render(); }
  })();
  </script>
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, "archive.html"), archiveHtml, "utf8");
console.log(`[build-site] archive.html (${dates.length} dates, ${searchDocs.filter((doc) => doc.text).length} searchable)`);

// .nojekyll prevents GitHub Pages from running Jekyll, which would otherwise
// strip directories whose names start with "_". We don't have any today but
// it's cheap insurance and standard practice for static-site GH Pages.
fs.writeFileSync(path.join(ROOT, ".nojekyll"), "", "utf8");
console.log(`[build-site] .nojekyll`);

if (accessPassword) {
  encryptSiteHtml(ROOT, accessPassword);
} else {
  console.log("[build-site] encryption disabled (set DAILY_BRIEF_PASSWORD to enable)");
}
