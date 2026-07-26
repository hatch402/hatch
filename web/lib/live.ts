/**
 * Live exit quoting.
 *
 * The console and the leaderboard read a snapshot taken once a day. That is
 * honest for a public page and useless to a liquidator, because a pool that
 * held $550k this morning is not a pool that holds $550k now.
 *
 * This is what the paid endpoint sells: the same question asked against the
 * current block instead of last night's file. Anything less would be a paywall
 * in front of data we already give away.
 */

import { createPublicClient, http, parseAbi, type Address } from "viem";

const PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com";

const client = createPublicClient({
  transport: http(process.env.RHC_RPC || PUBLIC_RPC, { timeout: 15_000 }),
});

const QUOTER = "0x8dc178efb8111bb0973dd9d722ebeff267c98f94" as Address;
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as Address;
const V2_FACTORY = "0x8bcEaA40B9AcdfAedF85AdF4FF01F5Ad6517937f" as Address;
const NO_HOOK = "0x0000000000000000000000000000000000000000" as Address;

const quoterAbi = parseAbi([
  "struct PoolKey { address currency0; address currency1; uint24 fee; int24 tickSpacing; address hooks; }",
  "struct QuoteExactSingleParams { PoolKey poolKey; bool zeroForOne; uint128 exactAmount; bytes hookData; }",
  "function quoteExactInputSingle(QuoteExactSingleParams params) returns (uint256 amountOut, uint256 gasEstimate)",
]);

const erc20Abi = parseAbi([
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
]);

const v2Abi = parseAbi([
  "function getPair(address,address) view returns (address)",
  "function getReserves() view returns (uint112,uint112,uint32)",
  "function token0() view returns (address)",
]);

/** Fee tiers worth trying for a stable-to-stable pair, deepest-first in practice. */
const FEE_TIERS: [number, number][] = [
  [100, 1], [500, 10], [100, 2], [3000, 60],
  [1000, 20], [2500, 50], [10000, 200],
];

export type LiveQuote = {
  block: string;
  v4: { fee: number; tickSpacing: number; amountOut: number } | null;
  v2: { pair: string; usdgInPair: number } | null;
  maxExitUsd: number;
  quotedOutUsd: number | null;
  clears: boolean;
  shortfallUsd: number;
  effectiveRate: number | null;
};

async function quoteV4(token: Address, decimals: number, amount: bigint) {
  const [currency0, currency1] =
    USDG.toLowerCase() < token.toLowerCase() ? [USDG, token] : [token, USDG];
  const zeroForOne = currency0.toLowerCase() === token.toLowerCase();

  let best: { fee: number; tickSpacing: number; amountOut: bigint } | null = null;
  for (const [fee, tickSpacing] of FEE_TIERS) {
    try {
      const { result } = await client.simulateContract({
        address: QUOTER,
        abi: quoterAbi,
        functionName: "quoteExactInputSingle",
        args: [
          {
            poolKey: { currency0, currency1, fee, tickSpacing, hooks: NO_HOOK },
            zeroForOne,
            exactAmount: amount,
            hookData: "0x",
          },
        ],
      });
      const amountOut = (result as readonly bigint[])[0];
      if (!best || amountOut > best.amountOut) best = { fee, tickSpacing, amountOut };
    } catch {
      // A tier with no pool reverts. That is information, not an error.
    }
  }
  return best;
}

async function quoteV2(token: Address) {
  try {
    const pair = await client.readContract({
      address: V2_FACTORY, abi: v2Abi, functionName: "getPair", args: [token, USDG],
    });
    if (!pair || pair === "0x0000000000000000000000000000000000000000") return null;
    const [reserves, token0] = await Promise.all([
      client.readContract({ address: pair, abi: v2Abi, functionName: "getReserves" }),
      client.readContract({ address: pair, abi: v2Abi, functionName: "token0" }),
    ]);
    const [r0, r1] = reserves as readonly [bigint, bigint, number];
    const usdgIsToken0 = (token0 as string).toLowerCase() === USDG.toLowerCase();
    return { pair: pair as string, usdgInPair: Number(usdgIsToken0 ? r0 : r1) / 1e6 };
  } catch {
    return null;
  }
}

/** Quote a sell of `sizeUsd` worth of `token` into USDG, at the current block. */
export async function quoteLive(token: Address, sizeUsd: number): Promise<LiveQuote> {
  const decimals = await client.readContract({
    address: token, abi: erc20Abi, functionName: "decimals",
  });
  const amount = BigInt(Math.round(sizeUsd)) * 10n ** BigInt(decimals as number);

  // Ask for an absurd size too: in a v4 pool the output asymptotes to whatever
  // USDG is in range, so that answer is the ceiling rather than a rate.
  const [blockNumber, atSize, atCeiling, v2] = await Promise.all([
    client.getBlockNumber(),
    quoteV4(token, decimals as number, amount),
    quoteV4(token, decimals as number, 10n ** 12n * 10n ** BigInt(decimals as number)),
    quoteV2(token),
  ]);

  const v4Ceiling = atCeiling ? Number(atCeiling.amountOut) / 1e6 : 0;
  const v2Ceiling = v2?.usdgInPair ?? 0;
  const maxExitUsd = v4Ceiling + v2Ceiling;
  const quotedOutUsd = atSize ? Number(atSize.amountOut) / 1e6 : null;

  return {
    block: blockNumber.toString(),
    v4: atSize
      ? { fee: atSize.fee, tickSpacing: atSize.tickSpacing, amountOut: quotedOutUsd! }
      : null,
    v2,
    maxExitUsd,
    quotedOutUsd,
    clears: sizeUsd <= maxExitUsd,
    shortfallUsd: Math.max(0, sizeUsd - maxExitUsd),
    effectiveRate: quotedOutUsd !== null ? quotedOutUsd / sizeUsd : null,
  };
}
