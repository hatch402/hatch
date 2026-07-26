#!/usr/bin/env python3
"""Check whether collateral has a local redemption path on Robinhood Chain.

Pool depth is only the binding exit constraint when a liquidator cannot redeem
the asset for its backing on the same chain. Some wrappers are ERC-4626 vaults
holding their backing locally and can be redeemed instantly and at size; others
are bridged representations - a LayerZero OFT, or an AccessControl ERC-20 whose
mint and burn authority sits with a bridge - whose redemption requires leaving
the chain first, which is neither instant nor atomic.

Measuring pool depth without checking this overstates the problem. This script
checks it. Read-only.

Requires `cast` (Foundry) and Python 3.9+.
"""

import json
import os
import subprocess
import time

PUBLIC_RPC = "https://rpc.mainnet.chain.robinhood.com"
USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"  # 6 decimals


def _resolve_rpc():
    """Pick an endpoint that actually answers.

    The public RPC is preferred because every command printed on the site uses
    it and must work for anyone. But some networks cert-block
    *.chain.robinhood.com, so fall back to whatever RHC_RPC points at. The
    fallback is read from the environment and never written to disk.
    """
    candidates = [c for c in (PUBLIC_RPC, os.environ.get("RHC_RPC")) if c]
    for endpoint in candidates:
        probe = subprocess.run(
            ["cast", "call", USDG, "decimals()(uint8)", "--rpc-url", endpoint],
            capture_output=True, text=True, timeout=25,
        )
        if probe.returncode == 0 and probe.stdout.strip():
            return endpoint
    raise SystemExit(
        "no reachable RPC. Set RHC_RPC to an endpoint that answers, or check "
        "whether this network blocks *.chain.robinhood.com."
    )


RPC = _resolve_rpc()

COLLATERAL = {
    "USDe": ("0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34", 18),
    "syrupUSDG": ("0x40858070814a57FdF33a613ae84fE0a8b4a874f7", 6),
    "spUSDG": ("0xde770c84FE66E063336b31737cFE9790f18c4087", 6),
}

# Redemption sizes to ladder, in whole units.
LADDER = [1, 1_000, 100_000, 1_000_000, 5_000_000, 10_000_000, 15_000_000]


class RpcUnavailable(Exception):
    """The node did not answer. This is not the same as the call reverting."""


def call(address, signature, *args, retries=3):
    """Return the first return value, or None if the call genuinely reverted.

    A transient RPC failure must never be reported as a revert - that would
    silently turn a dropped connection into "no liquidity". Retry, then raise
    rather than guess.
    """
    cmd = ["cast", "call", address, signature, *[str(a) for a in args],
           "--rpc-url", RPC]
    last_err = ""
    for attempt in range(retries):
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0 and result.stdout.strip():
            return result.stdout.strip().split()[0].replace("[", "")
        last_err = (result.stderr or "").lower()
        # A real revert is deterministic - do not waste retries on it.
        if "execution reverted" in last_err or "0x" in (result.stdout or ""):
            return None
        time.sleep(0.5 * (attempt + 1))
    raise RpcUnavailable(f"{signature} on {address}: {last_err.strip()[:200]}")


def find_role_holder(token, role):
    """Return the address most recently granted `role`, from RoleGranted logs."""
    result = subprocess.run(
        ["cast", "logs", "--from-block", "0", "--to-block", "latest",
         "--address", token, "RoleGranted(bytes32,address,address)",
         "--rpc-url", RPC, "--json"],
        capture_output=True, text=True,
    )
    if result.returncode != 0 or not result.stdout.strip():
        return None
    try:
        logs = json.loads(result.stdout)
    except json.JSONDecodeError:
        return None
    for entry in reversed(logs):
        topics = entry.get("topics", [])
        if len(topics) >= 3 and topics[1].lower() == role.lower():
            return "0x" + topics[2][-40:]
    return None


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
            try:
                out = call(token, "previewRedeem(uint256)(uint256)", size * 10 ** decimals)
                status = "OK" if out else "REVERT"
            except RpcUnavailable:
                out, status = None, "RPC_UNAVAILABLE"
            ladder.append({
                "redeem_units": size,
                "usdg_out": round(int(out) / 1e6, 2) if out else None,
                "status": status,
            })
        if any(r["status"] == "RPC_UNAVAILABLE" for r in ladder):
            report["ladder_incomplete"] = True
        report["redemption_ladder"] = ladder
        succeeded = [r["usdg_out"] for r in ladder if r["usdg_out"]]
        # A ceiling is only a ceiling if every larger size was actually answered.
        report["max_verified_redemption_usdg"] = max(succeeded) if succeeded else 0
        report["max_is_a_floor_not_a_ceiling"] = bool(report.get("ladder_incomplete"))

    # LayerZero OFT: a bridged representation, redeemable only off this chain.
    endpoint = call(token, "endpoint()(address)")
    report["layerzero_oft"] = endpoint is not None
    if endpoint:
        report["lz_endpoint"] = endpoint

    # Bridge-minted: an AccessControl ERC-20 where a single authority mints and
    # burns. Burning locally destroys the token; the credit is issued elsewhere,
    # asynchronously. Whether the mint authority holds any backing decides
    # whether a burn could ever be paid out on this chain.
    minter_role = call(token, "MINTER_ROLE()(bytes32)")
    burner_role = call(token, "BURNER_ROLE()(bytes32)")
    report["access_control_mint_burn"] = bool(minter_role and burner_role)
    if report["access_control_mint_burn"]:
        report["minter_role"] = minter_role
        report["burner_role"] = burner_role
        authority = find_role_holder(token, minter_role)
        if authority:
            report["mint_authority"] = authority
            backing = call(USDG, "balanceOf(address)(uint256)", authority)
            report["mint_authority_usdg_balance"] = (
                round(int(backing) / 1e6, 2) if backing else 0.0
            )

    if report["erc4626"]:
        report["local_exit"] = "REDEEMABLE"
        report["note"] = "ERC-4626 vault holding USDG locally; redeemable on-chain at size."
    elif report["layerzero_oft"]:
        report["local_exit"] = "BRIDGED"
        report["note"] = ("LayerZero OFT. Redemption to backing requires bridging off "
                          "Robinhood Chain first - not atomic, not available to a "
                          "liquidator inside one transaction.")
    elif report["access_control_mint_burn"]:
        held = report.get("mint_authority_usdg_balance", 0.0)
        report["local_exit"] = "BRIDGE_MINTED"
        report["note"] = ("AccessControl ERC-20 with a single mint/burn authority "
                          f"holding {held} USDG. Burning destroys the token here; any "
                          "credit is issued on another chain, asynchronously. With no "
                          "backing held locally there is nothing to redeem against, so "
                          "the pool is the only atomic exit.")
    else:
        report["local_exit"] = "NONE_FOUND"
        report["note"] = ("No ERC-4626, proxy, OFT, or mint/burn-authority interface "
                          "responded. No local redemption path identified. Absence of "
                          "evidence, not proof of absence.")

    return report


def main():
    block = subprocess.run(["cast", "block-number", "--rpc-url", RPC],
                           capture_output=True, text=True).stdout.strip()
    results = [check(symbol) for symbol in COLLATERAL]
    print(json.dumps({"chainId": 4663, "block": block, "collateral": results}, indent=2))


if __name__ == "__main__":
    main()
