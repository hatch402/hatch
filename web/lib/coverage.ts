import summary from "../../data/latest.json";

export type LadderStep = {
  size_in: number;
  usdg_out: number | null;
  slippage_pct: number | null;
  status: string;
};

export type Market = {
  symbol: string;
  loan: string;
  collateral: number;
  borrow: number;
  lltv: number | null;
  measured: boolean;
  pool?: number;
  redeem?: number;
  best?: number;
  coverage?: number;
  mechanism?: string;
  mechanism_label?: string;
  mechanism_note?: string;
};

export type Coverage = {
  chain_id: number;
  pool_block: string;
  redemption_block: string;
  market_count: number;
  total_borrow_usd: number;
  total_bad_debt_usd: number;
  measured_collateral_usd: number;
  measured_exit_usd: number;
  measured_coverage_pct: number;
  bridged_collateral_usd: number;
  bridged_exit_usd: number;
  bridged_coverage_pct: number;
  bridged_ratio: number;
  markets: Market[];
  ladders: Record<string, LadderStep[]>;
  redemption_detail: Record<string, Record<string, unknown>>;
};

export const coverage = summary as unknown as Coverage;

export const measured = coverage.markets.filter((m) => m.measured);

export function usd(value: number, decimals = 0): string {
  return `$${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

export function compact(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`;
  return `$${value.toFixed(0)}`;
}

export function findMarket(symbol: string): Market | undefined {
  const needle = symbol.toLowerCase();
  return coverage.markets.find((m) => m.symbol.toLowerCase() === needle);
}

/** Answer the question the product exists to answer: can this size get out? */
export function canExit(symbol: string, sizeUsd: number) {
  const market = findMarket(symbol);
  if (!market) return { found: false as const };
  if (!market.measured) return { found: true as const, measured: false as const, market };

  const ceiling = market.best ?? 0;
  const ladder = coverage.ladders[market.symbol] ?? [];

  // The largest laddered size that still tracked its input, so we can say what
  // the trade actually costs rather than only whether it clears.
  let slippage: number | null = null;
  for (const step of ladder) {
    if (step.usdg_out !== null && step.size_in <= sizeUsd) slippage = step.slippage_pct;
  }

  return {
    found: true as const,
    measured: true as const,
    market,
    ceiling,
    clears: sizeUsd <= ceiling,
    shortfall: Math.max(0, sizeUsd - ceiling),
    slippage,
  };
}
