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
    <p class="hint">这份简报已在发布前静态加密。首次输入后，此设备会记住 ${meta.rememberDays} 天。</p>
    <label for="password">密码</label>
    <input id="password" name="password" type="password" autocomplete="current-password" autofocus required>
    <label class="remember">
      <input id="remember" type="checkbox" checked>
      <span>在这台设备上记住 ${meta.rememberDays} 天</span>
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

// --- archive.html = list of all reports ---
const rows = dates
  .map((d) => {
    const size = (fs.statSync(path.join(ROOT, d, `${d}.html`)).size / 1024).toFixed(0);
    return `      <li><a href="./${d}/${d}.html">${d}</a> <span class="size">${size} KB</span></li>`;
  })
  .join("\n");

const archiveHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>daily-brief — archive</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  :root { color-scheme: light dark; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    max-width: 720px;
    margin: 3rem auto;
    padding: 0 1.5rem;
    line-height: 1.5;
  }
  h1 { margin-bottom: 0.2rem; font-size: 1.5rem; }
  .meta { color: #888; font-size: 0.9rem; margin-bottom: 1.5rem; }
  ul { list-style: none; padding: 0; }
  li {
    padding: 0.5rem 0;
    border-bottom: 1px solid #eee;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  @media (prefers-color-scheme: dark) {
    li { border-bottom-color: #2a2a2a; }
  }
  li a { text-decoration: none; }
  li a:hover { text-decoration: underline; }
  .size { color: #999; font-size: 0.85rem; }
  .top {
    margin-bottom: 2rem;
    padding: 0.75rem 1rem;
    background: #f6f6f6;
    border-radius: 6px;
  }
  @media (prefers-color-scheme: dark) {
    .top { background: #1e1e1e; }
  }
</style>
</head>
<body>
  <h1>daily-brief — archive</h1>
  <p class="meta">${dates.length} report${dates.length === 1 ? "" : "s"} · newest first · generated ${new Date().toISOString().slice(0, 10)}</p>
  <div class="top">
    <a href="./index.html">→ Latest report (${latest})</a>
  </div>
  <ul>
${rows}
  </ul>
</body>
</html>
`;
fs.writeFileSync(path.join(ROOT, "archive.html"), archiveHtml, "utf8");
console.log(`[build-site] archive.html (${dates.length} dates)`);

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
