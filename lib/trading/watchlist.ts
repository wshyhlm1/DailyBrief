export type AssetGroup =
  | "us-equity" // 美股蓝筹 + ETF
  | "crypto" // 加密货币
  | "china-equity" // 中概股 / 港股
  | "commodity-fx" // 商品 + 外汇
  | "macro"; // 宏观信号（恐慌指数 / 利率 / 美元指数）

export interface TickerDef {
  symbol: string; // Yahoo Finance symbol
  displayName: string; // 中文展示名
  displayNameEn?: string; // English display name (falls back to displayName if absent)
  group: AssetGroup;
}

export function getDisplayName(t: TickerDef, locale: "zh" | "en"): string {
  return locale === "en" ? (t.displayNameEn ?? t.displayName) : t.displayName;
}

const ASSET_GROUP_LABELS_ZH: Record<AssetGroup, string> = {
  "us-equity": "美股 / ADR / ETF",
  crypto: "加密货币",
  "china-equity": "中概 / 港股",
  "commodity-fx": "商品 / 外汇",
  macro: "宏观信号",
};

const ASSET_GROUP_LABELS_EN: Record<AssetGroup, string> = {
  "us-equity": "US Stocks / ADR / ETF",
  crypto: "Crypto",
  "china-equity": "China / HK",
  "commodity-fx": "Commodities / FX",
  macro: "Macro",
};

export function getAssetGroupLabels(
  locale: "zh" | "en",
): Record<AssetGroup, string> {
  return locale === "en" ? ASSET_GROUP_LABELS_EN : ASSET_GROUP_LABELS_ZH;
}

export const ASSET_GROUP_ORDER: AssetGroup[] = [
  "macro",
  "us-equity",
  "crypto",
  "china-equity",
  "commodity-fx",
];

export const WATCHLIST: TickerDef[] = [
  // === 用户跟踪的美股 / ADR / ETF ===
  // Broker suffixes are mapped to Yahoo Finance symbols:
  // .N/.O -> bare ticker, .PK IFNNY -> IFNNY, .P GLD -> GLD.
  { symbol: "IBM", displayName: "IBM", group: "us-equity" },
  { symbol: "AVGO", displayName: "博通 (AVGO)", displayNameEn: "Broadcom (AVGO)", group: "us-equity" },
  { symbol: "IFNNY", displayName: "英飞凌 ADR (IFNNY)", displayNameEn: "Infineon Technologies ADR (IFNNY)", group: "us-equity" },
  { symbol: "BB", displayName: "黑莓 (BB)", displayNameEn: "BlackBerry (BB)", group: "us-equity" },
  { symbol: "NBIS", displayName: "Nebius Group (NBIS)", group: "us-equity" },
  { symbol: "CIEN", displayName: "Ciena (CIEN)", group: "us-equity" },
  { symbol: "GLD", displayName: "SPDR 黄金 ETF (GLD)", displayNameEn: "SPDR Gold Shares (GLD)", group: "commodity-fx" },
  { symbol: "ASML", displayName: "ASML Holding (ASML)", group: "us-equity" },
  { symbol: "QQQ", displayName: "Invesco QQQ ETF (QQQ)", group: "us-equity" },
  { symbol: "AMD", displayName: "AMD", group: "us-equity" },
  { symbol: "GFS", displayName: "GlobalFoundries (GFS)", group: "us-equity" },
  { symbol: "AMZN", displayName: "亚马逊 (AMZN)", displayNameEn: "Amazon (AMZN)", group: "us-equity" },
  { symbol: "SANM", displayName: "Sanmina (SANM)", group: "us-equity" },
  { symbol: "AMKR", displayName: "Amkor Technology (AMKR)", group: "us-equity" },
  { symbol: "TSM", displayName: "台积电 ADR (TSM)", displayNameEn: "Taiwan Semiconductor ADR (TSM)", group: "china-equity" },
  { symbol: "BABA", displayName: "阿里巴巴 (BABA)", displayNameEn: "Alibaba (BABA)", group: "china-equity" },
  { symbol: "VICR", displayName: "Vicor (VICR)", group: "us-equity" },
  { symbol: "UMC", displayName: "联电 ADR (UMC)", displayNameEn: "United Microelectronics ADR (UMC)", group: "china-equity" },
  { symbol: "CBRS", displayName: "Cerebras Systems (CBRS)", group: "us-equity" },
  { symbol: "TE", displayName: "T1 Energy (TE)", group: "us-equity" },
  { symbol: "GOOGL", displayName: "Alphabet (GOOGL)", group: "us-equity" },
  { symbol: "SITM", displayName: "SiTime (SITM)", group: "us-equity" },
  { symbol: "NOK", displayName: "Nokia ADR (NOK)", group: "us-equity" },
  { symbol: "ASX", displayName: "日月光投控 ADR (ASX)", displayNameEn: "ASE Technology ADR (ASX)", group: "china-equity" },
  { symbol: "AAOI", displayName: "Applied Optoelectronics (AAOI)", group: "us-equity" },
  { symbol: "TSEM", displayName: "Tower Semiconductor (TSEM)", group: "us-equity" },
  { symbol: "SMTC", displayName: "Semtech (SMTC)", group: "us-equity" },
  // === 加密货币 ===
  { symbol: "BTC-USD", displayName: "Bitcoin", group: "crypto" },
  { symbol: "ETH-USD", displayName: "Ethereum", group: "crypto" },
  { symbol: "SOL-USD", displayName: "Solana", group: "crypto" },
  // === 宏观信号（恐慌指数 / 利率 / 美元）===
  { symbol: "^VIX", displayName: "VIX 恐慌指数", displayNameEn: "VIX (Volatility)", group: "macro" },
  { symbol: "^TNX", displayName: "10Y 美债收益率 (%)", displayNameEn: "10Y Treasury Yield (%)", group: "macro" },
  { symbol: "DX-Y.NYB", displayName: "美元指数 DXY", displayNameEn: "DXY (US Dollar Index)", group: "macro" },
];
