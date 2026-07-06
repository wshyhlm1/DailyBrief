export type EarningsRegion = "US" | "China" | "Taiwan" | "Korea";

export type EarningsTiming =
  | "before_market"
  | "after_market"
  | "during_market"
  | "not_supplied";

export type EarningsConfirmationStatus = "confirmed" | "estimated";

export interface EarningsSourceStatus {
  source_id: string;
  source_name: string;
  ok: boolean;
  events: number;
  url?: string;
  message?: string;
}

export interface EarningsEvent {
  company_id: string;
  company: string;
  company_zh?: string;
  ticker: string;
  tickers?: string[];
  region: EarningsRegion;
  report_date: string;
  timing: EarningsTiming;
  fiscal_period?: string;
  eps_estimate?: string;
  revenue_estimate?: string;
  expectation_note?: string;
  source: string;
  source_url: string;
  confirmation_status: EarningsConfirmationStatus;
}

export interface EarningsCalendarSnapshot {
  window_start: string;
  window_end: string;
  generated_at: string;
  lookahead_days: number;
  events: EarningsEvent[];
  source_status: EarningsSourceStatus[];
}

export interface EarningsCompany {
  id: string;
  company: string;
  company_zh: string;
  ticker: string;
  tickers: string[];
  region: EarningsRegion;
  priority: number;
  aliases: string[];
}

export interface EarningsCandidate extends EarningsEvent {
  source_priority: number;
}
