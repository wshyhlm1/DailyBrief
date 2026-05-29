import type { RawArticle } from "./types";

/**
 * AttentionVC tracks viral X (Twitter) posts. The current official API is
 * api.attentionvc.ai and requires ATTENTIONVC_API_KEY. The older public Cloud
 * Run leaderboard still answers some queries, so keep it as a best-effort
 * fallback for forks that have not configured a key yet.
 *
 * The legacy endpoint was originally discovered from the site's client bundle.
 * It is no longer authoritative and may return sparse/stale data, which is why
 * the official API is preferred whenever a key is configured.
 */
const LEGACY_BASE =
  "https://reply-vc-90459984647.us-central1.run.app/v1/articles/leaderboard";
const OFFICIAL_BASE = "https://api.attentionvc.ai/v1/x";
const FALLBACK_WINDOWS = ["3d", "7d", "14d"];

interface AvcAuthor {
  handle: string;
  name?: string;
  followers?: number;
  accountBasedIn?: string;
  isBlueVerified?: boolean;
}

interface AvcEntry {
  rank: number;
  tweetId: string;
  title: string;
  tweetCreatedAt: string;
  author: AvcAuthor;
  viewCount?: number;
  likeCount?: number;
  retweetCount?: number;
  replyCount?: number;
  previewText?: string;
  coverImageUrl?: string;
  category?: string;
  subcategory?: string;
  tags?: string[];
  lang?: string;
  langsDetected?: string[];
}

interface AvcResponse {
  entries: AvcEntry[];
  updatedAt?: string;
  totalCount?: number;
}

interface AvcOfficialAuthor {
  handle?: string;
  userName?: string;
  username?: string;
  name?: string;
  followers?: number;
}

interface AvcOfficialEntry {
  tweetId: string;
  title: string;
  tweetCreatedAt?: string;
  createdAt?: string;
  publishedAt?: string;
  author?: AvcOfficialAuthor;
  metrics?: {
    views?: number;
    viewCount?: number;
    likes?: number;
    likeCount?: number;
    retweets?: number;
    retweetCount?: number;
    replies?: number;
    replyCount?: number;
    bookmarks?: number;
  };
  momentum?: {
    viewsGained?: number;
    velocityPerHour?: number;
  };
  previewText?: string;
  text?: string;
  summary?: string;
  category?: string;
  lang?: string;
  langsDetected?: string[];
}

interface AvcOfficialResponse {
  success?: boolean;
  data?: {
    articles?: AvcOfficialEntry[];
    total?: number;
  };
  error?: string;
}

function compactNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

/**
 * Build a one-line metadata string shown above the excerpt. Mirrors the
 * `meta` convention used by GitHub Trending ("Language · ★stars · forks").
 */
function buildMeta(e: AvcEntry): string {
  const parts: string[] = [`@${e.author.handle}`];
  if (typeof e.author.followers === "number") {
    parts.push(`${compactNumber(e.author.followers)} 粉丝`);
  }
  if (typeof e.viewCount === "number") {
    parts.push(`${compactNumber(e.viewCount)} 阅`);
  }
  if (typeof e.likeCount === "number") {
    parts.push(`${compactNumber(e.likeCount)} 赞`);
  }
  if (typeof e.retweetCount === "number" && e.retweetCount > 0) {
    parts.push(`${compactNumber(e.retweetCount)} 转`);
  }
  return parts.join(" · ");
}

function buildOfficialMeta(e: AvcOfficialEntry): string {
  const handle = e.author?.handle ?? e.author?.userName ?? e.author?.username;
  const parts: string[] = handle ? [`@${handle}`] : [];
  if (typeof e.author?.followers === "number") {
    parts.push(`${compactNumber(e.author.followers)} 粉丝`);
  }
  const views = e.metrics?.views ?? e.metrics?.viewCount;
  const likes = e.metrics?.likes ?? e.metrics?.likeCount;
  const retweets = e.metrics?.retweets ?? e.metrics?.retweetCount;
  if (typeof views === "number") parts.push(`${compactNumber(views)} 阅`);
  if (typeof likes === "number") parts.push(`${compactNumber(likes)} 赞`);
  if (typeof retweets === "number" && retweets > 0) {
    parts.push(`${compactNumber(retweets)} 转`);
  }
  if (typeof e.momentum?.velocityPerHour === "number") {
    parts.push(`${compactNumber(e.momentum.velocityPerHour)}/h`);
  }
  return parts.join(" · ");
}

/**
 * The API's `lang` query param is best-effort — Japanese/Korean tweets
 * still slip through even with `lang=en`. Filter client-side using
 * `langsDetected` (most reliable) with `lang` as fallback. `zxx` means
 * "no linguistic content" (image/code-only tweets) — keep those since
 * they're still indexable AI content.
 */
function isEnglish(e: AvcEntry): boolean {
  if (e.langsDetected && e.langsDetected.length > 0) {
    return e.langsDetected.includes("en");
  }
  if (e.lang === "en" || e.lang === "zxx") return true;
  return false;
}

function isOfficialEnglish(e: AvcOfficialEntry): boolean {
  if (e.langsDetected && e.langsDetected.length > 0) {
    return e.langsDetected.includes("en");
  }
  if (e.lang === "en" || e.lang === "zxx") return true;
  return false;
}

function officialDate(e: AvcOfficialEntry): Date | undefined {
  const value = e.tweetCreatedAt ?? e.publishedAt ?? e.createdAt;
  return value ? new Date(value) : undefined;
}

function officialUrl(e: AvcOfficialEntry): string {
  const handle = e.author?.handle ?? e.author?.userName ?? e.author?.username;
  if (handle) return `https://x.com/${handle}/status/${e.tweetId}`;
  return `https://x.com/i/web/status/${e.tweetId}`;
}

async function fetchOfficialAttentionVc(
  sourceId: string,
  limit: number,
): Promise<RawArticle[]> {
  const apiKey = process.env.ATTENTIONVC_API_KEY?.trim();
  if (!apiKey) return [];

  const headers = {
    "User-Agent": "Mozilla/5.0 (compatible; DailyBriefBot/1.0)",
    Accept: "application/json",
    Authorization: `Bearer ${apiKey}`,
  };
  const urls = [
    `${OFFICIAL_BASE}/articles/rising?hours=72&category=ai&lang=en&limit=${Math.min(Math.max(limit, 20), 50)}`,
    `${OFFICIAL_BASE}/articles?window=3d&category=ai&lang=en&sortBy=views&limit=${Math.min(Math.max(limit, 20), 100)}`,
    `${OFFICIAL_BASE}/articles?window=7d&category=ai&lang=en&sortBy=views&limit=${Math.min(Math.max(limit, 20), 100)}`,
  ];

  for (const url of urls) {
    const res = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `attentionvc official HTTP ${res.status}${body ? `: ${body.slice(0, 160)}` : ""}`,
      );
    }
    const data = (await res.json()) as AvcOfficialResponse;
    const entries = (data.data?.articles ?? []).filter(isOfficialEnglish);
    if (entries.length === 0) continue;
    return entries.slice(0, limit).map((e) => ({
      sourceId,
      title: e.title,
      url: officialUrl(e),
      excerpt: (e.previewText ?? e.summary ?? e.text)
        ?.replace(/\s+/g, " ")
        .trim()
        .slice(0, 300),
      publishedAt: officialDate(e),
      category: "tech" as const,
      meta: buildOfficialMeta(e),
    }));
  }
  return [];
}

async function fetchLegacyAttentionVc(
  sourceId: string,
  limit: number,
): Promise<RawArticle[]> {
  const requestLimit = Math.min(Math.max(limit + 10, 30), 60);
  for (const window of FALLBACK_WINDOWS) {
    const url = `${LEGACY_BASE}?window=${window}&category=ai&lang=en&limit=${requestLimit}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; DailyBriefBot/1.0)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15_000),
    });
    if (!res.ok) {
      throw new Error(`attentionvc legacy HTTP ${res.status}`);
    }
    const data = (await res.json()) as AvcResponse;
    const entries = (data.entries ?? []).filter(isEnglish);
    if (entries.length === 0) continue;
    if (window !== FALLBACK_WINDOWS[0]) {
      console.warn(
        `[attentionvc] legacy ${FALLBACK_WINDOWS[0]} window was empty; using ${window} fallback`,
      );
    }
    return entries.slice(0, limit).map((e) => ({
      sourceId,
      title: e.title,
      url: `https://x.com/${e.author.handle}/status/${e.tweetId}`,
      excerpt: e.previewText?.replace(/\s+/g, " ").trim().slice(0, 300),
      publishedAt: e.tweetCreatedAt ? new Date(e.tweetCreatedAt) : undefined,
      category: "tech" as const,
      meta: buildMeta(e),
    }));
  }
  return [];
}

export async function fetchAttentionVc(
  sourceId: string,
  limit = 20,
): Promise<RawArticle[]> {
  try {
    const official = await fetchOfficialAttentionVc(sourceId, limit);
    if (official.length > 0) return official;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn(
      `[attentionvc] official API failed, falling back to legacy endpoint: ${msg}`,
    );
  }
  return fetchLegacyAttentionVc(sourceId, limit);
}
