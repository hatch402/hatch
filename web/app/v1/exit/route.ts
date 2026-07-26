import { NextRequest, NextResponse } from "next/server";
import { coverage, canExit, findMarket } from "../../../lib/coverage";
import { verifyPayment, challenge, PRICE_USDG, PASS_DAYS } from "../../../lib/payment";

export const dynamic = "force-dynamic";

const RESOURCE = "/v1/exit";

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

  const result = canExit(symbol, size);
  if (!result.found || !result.measured) {
    return NextResponse.json(
      {
        symbol: market.symbol,
        measured: false,
        note: "this market has exposure but no probe yet; it is never counted as covered",
      },
      { status: 200 },
    );
  }

  return NextResponse.json(
    {
      symbol: market.symbol,
      loanAsset: market.loan,
      askedUsd: size,
      clears: result.clears,
      maxExitUsd: result.ceiling,
      shortfallUsd: result.shortfall,
      slippagePctAtSize: result.slippage,
      mechanism: market.mechanism,
      mechanismNote: market.mechanism_note,
      collateralUsd: market.collateral,
      coveragePct: market.coverage,
      measuredAt: { poolBlock: coverage.pool_block, redemptionBlock: coverage.redemption_block },
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
