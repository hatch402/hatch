import { NextResponse } from "next/server";
import { coverage } from "../../../lib/coverage";
import { PAY_TO, PRICE_USDG, PASS_DAYS } from "../../../lib/payment";

export const dynamic = "force-dynamic";

/** Checked by the daily job. r0x did not die of bad code - it died because the
 *  endpoint stopped answering and nobody noticed. */
export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "lastout",
    chainId: coverage.chain_id,
    dataAsOf: { poolBlock: coverage.pool_block, redemptionBlock: coverage.redemption_block },
    marketsMeasured: coverage.markets.filter((m) => m.measured).length,
    payments: {
      accepting: Boolean(PAY_TO),
      priceUsdg: PRICE_USDG,
      passDays: PASS_DAYS,
      asset: "USDG",
      network: "eip155:4663",
    },
  });
}
