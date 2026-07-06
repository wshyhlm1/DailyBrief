import type { EarningsCompany, EarningsRegion } from "./types";

export const REGION_ORDER: Record<EarningsRegion, number> = {
  US: 0,
  China: 1,
  Taiwan: 2,
  Korea: 3,
};

export const EARNINGS_WATCHLIST: EarningsCompany[] = [
  // United States
  {
    id: "aapl",
    company: "Apple",
    company_zh: "苹果",
    ticker: "AAPL",
    tickers: ["AAPL"],
    region: "US",
    priority: 10,
    aliases: ["Apple Inc", "Apple"],
  },
  {
    id: "msft",
    company: "Microsoft",
    company_zh: "微软",
    ticker: "MSFT",
    tickers: ["MSFT"],
    region: "US",
    priority: 10,
    aliases: ["Microsoft", "Microsoft Corp", "Microsoft Corporation"],
  },
  {
    id: "googl",
    company: "Alphabet",
    company_zh: "谷歌母公司",
    ticker: "GOOGL",
    tickers: ["GOOGL", "GOOG"],
    region: "US",
    priority: 10,
    aliases: ["Alphabet", "Alphabet Inc", "Google"],
  },
  {
    id: "amzn",
    company: "Amazon",
    company_zh: "亚马逊",
    ticker: "AMZN",
    tickers: ["AMZN"],
    region: "US",
    priority: 10,
    aliases: ["Amazon", "Amazon.com", "Amazon.com Inc"],
  },
  {
    id: "meta",
    company: "Meta Platforms",
    company_zh: "Meta",
    ticker: "META",
    tickers: ["META"],
    region: "US",
    priority: 9,
    aliases: ["Meta", "Meta Platforms", "Meta Platforms Inc"],
  },
  {
    id: "nvda",
    company: "NVIDIA",
    company_zh: "英伟达",
    ticker: "NVDA",
    tickers: ["NVDA"],
    region: "US",
    priority: 10,
    aliases: ["NVIDIA", "Nvidia Corp", "NVIDIA Corporation"],
  },
  {
    id: "amd",
    company: "AMD",
    company_zh: "AMD",
    ticker: "AMD",
    tickers: ["AMD"],
    region: "US",
    priority: 9,
    aliases: ["AMD", "Advanced Micro Devices"],
  },
  {
    id: "avgo",
    company: "Broadcom",
    company_zh: "博通",
    ticker: "AVGO",
    tickers: ["AVGO"],
    region: "US",
    priority: 9,
    aliases: ["Broadcom", "Broadcom Inc"],
  },
  {
    id: "mu",
    company: "Micron Technology",
    company_zh: "美光",
    ticker: "MU",
    tickers: ["MU"],
    region: "US",
    priority: 9,
    aliases: ["Micron", "Micron Technology"],
  },
  {
    id: "intc",
    company: "Intel",
    company_zh: "英特尔",
    ticker: "INTC",
    tickers: ["INTC"],
    region: "US",
    priority: 8,
    aliases: ["Intel", "Intel Corp", "Intel Corporation"],
  },
  {
    id: "orcl",
    company: "Oracle",
    company_zh: "甲骨文",
    ticker: "ORCL",
    tickers: ["ORCL"],
    region: "US",
    priority: 8,
    aliases: ["Oracle", "Oracle Corp", "Oracle Corporation"],
  },

  // China / HK / ADR
  {
    id: "baba",
    company: "Alibaba",
    company_zh: "阿里巴巴",
    ticker: "BABA",
    tickers: ["BABA", "9988.HK", "9988"],
    region: "China",
    priority: 9,
    aliases: ["Alibaba", "Alibaba Group", "Alibaba ADR"],
  },
  {
    id: "tencent",
    company: "Tencent",
    company_zh: "腾讯",
    ticker: "TCEHY",
    tickers: ["TCEHY", "0700.HK", "700.HK", "0700", "700"],
    region: "China",
    priority: 9,
    aliases: ["Tencent", "Tencent Holdings"],
  },
  {
    id: "pdd",
    company: "PDD Holdings",
    company_zh: "拼多多",
    ticker: "PDD",
    tickers: ["PDD"],
    region: "China",
    priority: 8,
    aliases: ["PDD", "PDD Holdings", "Pinduoduo"],
  },
  {
    id: "jd",
    company: "JD.com",
    company_zh: "京东",
    ticker: "JD",
    tickers: ["JD", "9618.HK", "9618"],
    region: "China",
    priority: 8,
    aliases: ["JD.com", "JD", "Jingdong"],
  },
  {
    id: "bidu",
    company: "Baidu",
    company_zh: "百度",
    ticker: "BIDU",
    tickers: ["BIDU", "9888.HK", "9888"],
    region: "China",
    priority: 8,
    aliases: ["Baidu", "Baidu Inc"],
  },
  {
    id: "xiaomi",
    company: "Xiaomi",
    company_zh: "小米",
    ticker: "1810.HK",
    tickers: ["1810.HK", "1810"],
    region: "China",
    priority: 7,
    aliases: ["Xiaomi", "Xiaomi Corp", "Xiaomi Corporation"],
  },
  {
    id: "smic",
    company: "SMIC",
    company_zh: "中芯国际",
    ticker: "0981.HK",
    tickers: ["0981.HK", "981.HK", "0981", "981"],
    region: "China",
    priority: 8,
    aliases: ["SMIC", "Semiconductor Manufacturing International"],
  },
  {
    id: "meituan",
    company: "Meituan",
    company_zh: "美团",
    ticker: "3690.HK",
    tickers: ["3690.HK", "3690"],
    region: "China",
    priority: 7,
    aliases: ["Meituan"],
  },

  // Taiwan
  {
    id: "tsmc",
    company: "TSMC",
    company_zh: "台积电",
    ticker: "TSM",
    tickers: ["TSM", "2330.TW", "2330"],
    region: "Taiwan",
    priority: 10,
    aliases: [
      "TSMC",
      "Taiwan Semiconductor",
      "Taiwan Semiconductor Manufacturing",
      "Taiwan Semiconductor Manufacturing Company",
    ],
  },
  {
    id: "umc",
    company: "UMC",
    company_zh: "联电",
    ticker: "UMC",
    tickers: ["UMC", "2303.TW", "2303"],
    region: "Taiwan",
    priority: 7,
    aliases: ["UMC", "United Microelectronics"],
  },
  {
    id: "ase",
    company: "ASE Technology",
    company_zh: "日月光投控",
    ticker: "ASX",
    tickers: ["ASX", "3711.TW", "3711"],
    region: "Taiwan",
    priority: 7,
    aliases: ["ASE", "ASE Technology", "ASE Technology Holding"],
  },
  {
    id: "mediatek",
    company: "MediaTek",
    company_zh: "联发科",
    ticker: "2454.TW",
    tickers: ["2454.TW", "2454"],
    region: "Taiwan",
    priority: 8,
    aliases: ["MediaTek", "Mediatek Inc"],
  },
  {
    id: "foxconn",
    company: "Hon Hai Precision",
    company_zh: "鸿海",
    ticker: "2317.TW",
    tickers: ["2317.TW", "2317"],
    region: "Taiwan",
    priority: 8,
    aliases: ["Hon Hai", "Foxconn", "Hon Hai Precision"],
  },
  {
    id: "quanta",
    company: "Quanta Computer",
    company_zh: "广达",
    ticker: "2382.TW",
    tickers: ["2382.TW", "2382"],
    region: "Taiwan",
    priority: 7,
    aliases: ["Quanta", "Quanta Computer"],
  },

  // Korea
  {
    id: "samsung-electronics",
    company: "Samsung Electronics",
    company_zh: "三星电子",
    ticker: "005930.KS",
    tickers: ["005930.KS", "005930", "5930"],
    region: "Korea",
    priority: 10,
    aliases: ["Samsung Electronics", "Samsung Electronics Co", "Samsung"],
  },
  {
    id: "sk-hynix",
    company: "SK Hynix",
    company_zh: "SK 海力士",
    ticker: "000660.KS",
    tickers: ["000660.KS", "000660", "660"],
    region: "Korea",
    priority: 10,
    aliases: ["SK Hynix", "SK hynix", "SK Hynix Inc"],
  },
];

function normalizeLookupKey(input: string): string {
  return input
    .toUpperCase()
    .replace(/&AMP;/g, "&")
    .replace(/[^A-Z0-9.]+/g, "");
}

function lookupVariants(input: string): string[] {
  const normalized = normalizeLookupKey(input);
  const out = new Set<string>([normalized]);
  const noSuffix = normalized.replace(/\.(HK|TW|KS|O|N|PK)$/u, "");
  out.add(noSuffix);
  if (/^0+\d+$/u.test(noSuffix)) out.add(noSuffix.replace(/^0+/u, ""));
  return [...out].filter(Boolean);
}

const COMPANY_BY_KEY = new Map<string, EarningsCompany>();
for (const company of EARNINGS_WATCHLIST) {
  const keys = [
    company.id,
    company.company,
    company.company_zh,
    company.ticker,
    ...company.tickers,
    ...company.aliases,
  ];
  for (const key of keys) {
    for (const variant of lookupVariants(key)) COMPANY_BY_KEY.set(variant, company);
  }
}

export function findEarningsCompany(
  symbolOrTicker: string | undefined,
  companyName?: string,
): EarningsCompany | undefined {
  const probes = [symbolOrTicker, companyName].filter(
    (v): v is string => typeof v === "string" && v.trim().length > 0,
  );
  for (const probe of probes) {
    for (const variant of lookupVariants(probe)) {
      const exact = COMPANY_BY_KEY.get(variant);
      if (exact) return exact;
    }
  }

  if (companyName) {
    const normalizedName = normalizeLookupKey(companyName);
    for (const company of EARNINGS_WATCHLIST) {
      const aliases = [company.company, company.company_zh, ...company.aliases]
        .map(normalizeLookupKey)
        .filter((alias) => alias.length >= 6);
      if (
        aliases.some(
          (alias) => normalizedName === alias || normalizedName.includes(alias),
        )
      ) {
        return company;
      }
    }
  }

  return undefined;
}
