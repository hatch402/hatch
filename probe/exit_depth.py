#!/usr/bin/env python3
"""Measure liquidation exit capacity on Robinhood Chain (chain 4663).

A liquidator on this chain has effectively one venue it can call from a contract:
raw Uniswap v4 pools. 0x rejects the assets, Arcus and Lighter sign orders
off-chain, and the UniswapX reactor carries no code here. So the honest question
for any lending market is not "what is this collateral worth" but "how much of it
can be sold before the pool stops responding".

This script ladders sell sizes for each collateral against USDG through the
Uniswap v4 Quoter and reports the size at which output stops tracking input.
Read-only: nothing is signed, nothing settles, no funds move.

Requires `cast` (Foundry) and Python 3.9+.
"""

import json
import subprocess
import concurrent.futures as futures

RPC = "https://rpc.mainnet.chain.robinhood.com"
QUOTER = "0x8dc178efb8111bb0973dd9d722ebeff267c98f94"
USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"  # 6 decimals
ZERO_HOOK = "0x" + "0" * 40

QUOTE_SIG = (
    "quoteExactInputSingle("
    "((address,address,uint24,int24,address),bool,uint128,bytes)"
    ")(uint256,uint256)"
)

# Collateral assets backing the three Morpho markets that hold the borrow.
COLLATERAL = {
    "USDe": ("0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", 18),
    "syrupUSDG": ("0x40858070814a57FdF33a613ae84fE0a8b4a874f7", 6),
    "spUSDG": ("0xde770c84FE66E063336b31737cFE9790f18c4087", 6),
}

# (fee, tickSpacing) combinations to search for a live pool. Ordered roughly by
# how likely a stable-to-stable pair is to use them.
FEE_TIERS = [
    (100, 1),
    (500, 10),
    (100, 2),
    (3000, 60),
    (1000, 20),
    (2500, 50),
    (10000, 200),
    (50, 1),
    (200, 4),
]

# Sell sizes in whole units of collateral (all three are ~$1 assets).
LADDER = [
    10_000,
    50_000,
    100_000,
    250_000,
    500_000,
    1_000_000,
    2_500_000,
    5_000_000,
    10_000_000,
    50_000_000,
    200_000_000,
]

# Deliberately absurd input. In a v4 pool the output asymptotes to the USDG
# available in range, so this reveals the ceiling rather than a rate.
CEILING_PROBE = 10 ** 12


def quote(token0, token1, fee, tick_spacing, zero_for_one, amount_in):
    """Return USDG out (raw units) for amount_in, or None if the quote reverts."""
    pool_key = f"({token0},{token1},{fee},{tick_spacing},{ZERO_HOOK})"
    arg = f"({pool_key},{'true' if zero_for_one else 'false'},{amount_in},0x)"
    result = subprocess.run(
        ["cast", "call", QUOTER, QUOTE_SIG, arg, "--rpc-url", RPC],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        return None
    try:
        return int(result.stdout.strip().split()[0].replace("[", ""))
    except (ValueError, IndexError):
        return None


def measure(symbol):
    token, decimals = COLLATERAL[symbol]

    # Uniswap orders a pool's currencies by address, so derive the direction.
    if USDG.lower() < token.lower():
        currency0, currency1 = USDG, token
    else:
        currency0, currency1 = token, USDG
    selling_currency0 = currency0.lower() == token.lower()

    # Find the deepest live pool using a small probe.
    best = None
    for fee, tick_spacing in FEE_TIERS:
        out = quote(
            currency0, currency1, fee, tick_spacing,
            selling_currency0, 10_000 * 10 ** decimals,
        )
        if out is not None and (best is None or out > best[0]):
            best = (out, fee, tick_spacing)

    if best is None:
        return {"symbol": symbol, "pool": None, "note": "no pool responded"}

    out_at_10k, fee, tick_spacing = best
    # USDG received per unit of collateral at $10k — the undistorted reference.
    reference_rate = (out_at_10k / 1e6) / 10_000

    ladder = []
    for size in LADDER:
        out = quote(
            currency0, currency1, fee, tick_spacing,
            selling_currency0, size * 10 ** decimals,
        )
        if out is None:
            ladder.append({"size_in": size, "usdg_out": None, "slippage_pct": None,
                           "status": "REVERT"})
            continue
        effective_rate = (out / 1e6) / size
        ladder.append({
            "size_in": size,
            "usdg_out": round(out / 1e6, 2),
            "slippage_pct": round((effective_rate / reference_rate - 1) * 100, 3),
            "status": "OK",
        })

    ceiling = quote(
        currency0, currency1, fee, tick_spacing,
        selling_currency0, CEILING_PROBE * 10 ** decimals,
    )

    return {
        "symbol": symbol,
        "token": token,
        "pool": {"fee": fee, "tickSpacing": tick_spacing},
        "reference_rate_at_10k": round(reference_rate, 6),
        "ladder": ladder,
        "max_atomic_exit_usdg": round(ceiling / 1e6, 2) if ceiling else None,
    }


def main():
    with futures.ThreadPoolExecutor(max_workers=3) as pool:
        results = list(pool.map(measure, COLLATERAL))

    block = subprocess.run(
        ["cast", "block-number", "--rpc-url", RPC],
        capture_output=True, text=True,
    ).stdout.strip()

    print(json.dumps({"chainId": 4663, "block": block, "markets": results}, indent=2))


if __name__ == "__main__":
    main()
