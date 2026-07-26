import { NextRequest, NextResponse } from "next/server";
import { coverage, findMarket } from "../../../lib/coverage";
import { quoteLive } from "../../../lib/live";
import { verifyPayment, challenge, PRICE_USDG, PASS_DAYS } from "../../../lib/payment";

export const dynamic = "force-dynamic";

const RESOURCE = "/v1/exit";

const ADDRESSES: Record<string, string> = {
  USDe: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34",
  syrupUSDG: "0x40858070814a57FdF33a613ae84fE0a8b4a874f7",
  spUSDG: "0xde770c84FE66E063336b31737cFE9790f18c4087",
};

/**
 * The paid endpoint. Answers, for a size a caller names, whether that size can
 * leave — the question the free leaderboard cannot answer because it does not
 * know the caller's size.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const symbol = params.get("symbol");
  const sizeRaw = params.get("size");

  if (!symbol || !sizeRaw) {
    return NextResponse.json(
      {
        error: "symbol and size are required",
        example: "/v1/exit?symbol=USDe&size=1000000",
        known: coverage.markets.map((m) => m.symbol),
      },
      { status: 400 },
    );
  }

  const size = Number(sizeRaw.replace(/[$,_]/g, ""));
  if (!Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: `"${sizeRaw}" is not a size` }, { status: 400 });
  }

  const paymentHeader = request.headers.get("x-payment");
  if (!paymentHeader) {
    return NextResponse.json(challenge(RESOURCE), {
      status: 402,
      headers: { "cache-control": "no-store" },
    });
  }

  const payment = await verifyPayment(paymentHeader.trim());
  if (!payment.ok) {
    return NextResponse.json(
      { ...challenge(RESOURCE), rejected: payment.reason },
      { status: 402, headers: { "cache-control": "no-store" } },
    );
  }

  const market = findMarket(symbol);
  if (!market) {
    return NextResponse.json(
      { error: `no market for "${symbol}"`, known: coverage.markets.map((m) => m.symbol) },
      { status: 404 },
    );
  }

  const address = ADDRESSES[market.symbol];
  if (!address) {
    return NextResponse.json(
      {
        symbol: market.symbol,
        measured: false,
        note: "this market has exposure but no probe yet; it is never counted as covered",
      },
      { status: 200 },
    );
  }

  // The whole reason this costs money: quoted against the current block, not
  // against the snapshot the public page serves. For a liquidator the
  // difference between now and last night is the difference between a right
  // answer and a wrong one.
  let live;
  try {
    live = await quoteLive(address as `0x${string}`, size);
  } catch (error) {
    return NextResponse.json(
      {
        error: "could not reach the chain to quote this",
        detail: error instanceof Error ? error.message.slice(0, 200) : "unknown",
        hint: "no answer is better than a stale one presented as live",
      },
      { status: 503, headers: { "cache-control": "no-store" } },
    );
  }

  return NextResponse.json(
    {
      symbol: market.symbol,
      loanAsset: market.loan,
      askedUsd: size,

      quotedAtBlock: live.block,
      clears: live.clears,
      maxExitUsd: Number(live.maxExitUsd.toFixed(2)),
      wouldReceiveUsd: live.quotedOutUsd === null ? null : Number(live.quotedOutUsd.toFixed(2)),
      shortfallUsd: Number(live.shortfallUsd.toFixed(2)),
      costPct:
        live.effectiveRate === null ? null : Number(((1 - live.effectiveRate) * 100).toFixed(3)),
      venues: {
        uniswapV4: live.v4 && { fee: live.v4.fee, tickSpacing: live.v4.tickSpacing },
        uniswapV2: live.v2 && { pair: live.v2.pair, usdgInPair: live.v2.usdgInPair },
      },

      mechanism: market.mechanism,
      mechanismNote: market.mechanism_note,
      collateralUsd: market.collateral,

      snapshotForComparison: {
        maxExitUsd: market.best,
        poolBlock: coverage.pool_block,
        note: "what the free page currently shows, for reference",
      },

      caveat:
        "Quoted, not settled. A quote and an executed transaction can disagree where hooks or transfer restrictions are involved. Coverage is not a forecast.",
      pass: { payer: payment.payer, paidUsdg: payment.paidUsdg, expiresAt: payment.expiresAt },
    },
    { headers: { "cache-control": "no-store" } },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "x-payment",
      "access-control-allow-methods": "GET, OPTIONS",
    },
  });
}
