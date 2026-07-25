#!/usr/bin/env python3
"""Check whether collateral has a local redemption path on Robinhood Chain.

Pool depth is only the binding exit constraint when a liquidator cannot redeem
the asset for its backing on the same chain. Some wrappers are ERC-4626 vaults
holding their backing locally and can be redeemed instantly and at size; others
are bridged representations (LayerZero OFT) whose redemption requires leaving
the chain first, which is neither instant nor atomic.

Measuring pool depth without checking this overstates the problem. This script
checks it. Read-only.

Requires `cast` (Foundry) and Python 3.9+.
"""

import json
import subprocess

RPC = "https://rpc.mainnet.chain.robinhood.com"
USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"  # 6 decimals

COLLATERAL = {
    "USDe": ("0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", 18),
    "syrupUSDG": ("0x40858070814a57FdF33a613ae84fE0a8b4a874f7", 6),
    "spUSDG": ("0xde770c84FE66E063336b31737cFE9790f18c4087", 6),
}

# Redemption sizes to ladder, in whole units.
LADDER = [1, 1_000, 100_000, 1_000_000, 5_000_000, 10_000_000, 15_000_000]


def call(address, signature, *args):
    """Return the first return value as a string, or None if the call reverts."""
    cmd = ["cast", "call", address, signature, *[str(a) for a in args],
           "--rpc-url", RPC]
    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0 or not result.stdout.strip():
        return None
    return result.stdout.strip().split()[0].replace("[", "")


def check(symbol):
    token, decimals = COLLATERAL[symbol]
    report = {"symbol": symbol, "token": token}

    # ERC-4626: a local vault holding the backing asset.
    asset = call(token, "asset()(address)")
    report["erc4626"] = asset is not None
    if asset:
        report["backing_asset"] = asset
        report["backing_is_usdg"] = asset.lower() == USDG.lower()
        total_assets = call(token, "totalAssets()(uint256)")
        idle = call(USDG, "balanceOf(address)(uint256)", token)
        report["total_assets_usdg"] = round(int(total_assets) / 1e6, 2) if total_assets else None
        # Backing actually sitting in the contract is what can be paid out now.
        report["idle_usdg_in_vault"] = round(int(idle) / 1e6, 2) if idle else None

        ladder = []
        for size in LADDER:
            out = call(token, "previewRedeem(uint256)(uint256)", size * 10 ** decimals)
            ladder.append({
                "redeem_units": size,
                "usdg_out": round(int(out) / 1e6, 2) if out else None,
                "status": "OK" if out else "REVERT",
            })
        report["redemption_ladder"] = ladder
        succeeded = [r["usdg_out"] for r in ladder if r["usdg_out"]]
        report["max_verified_redemption_usdg"] = max(succeeded) if succeeded else 0

    # LayerZero OFT: a bridged representation, redeemable only off this chain.
    endpoint = call(token, "endpoint()(address)")
    report["layerzero_oft"] = endpoint is not None
    if endpoint:
        report["lz_endpoint"] = endpoint

    if report["erc4626"]:
        report["local_exit"] = "REDEEMABLE"
        report["note"] = "ERC-4626 vault holding USDG locally; redeemable on-chain at size."
    elif report["layerzero_oft"]:
        report["local_exit"] = "BRIDGED"
        report["note"] = ("LayerZero OFT. Redemption to backing requires bridging off "
                          "Robinhood Chain first - not atomic, not available to a "
                          "liquidator inside one transaction.")
    else:
        report["local_exit"] = "NONE_FOUND"
        report["note"] = ("No ERC-4626, proxy, or OFT interface responded. No local "
                          "redemption path identified; the pool appears to be the only "
                          "on-chain exit. Absence of evidence, not proof of absence.")

    return report


def main():
    block = subprocess.run(["cast", "block-number", "--rpc-url", RPC],
                           capture_output=True, text=True).stdout.strip()
    results = [check(symbol) for symbol in COLLATERAL]
    print(json.dumps({"chainId": 4663, "block": block, "collateral": results}, indent=2))


if __name__ == "__main__":
    main()
