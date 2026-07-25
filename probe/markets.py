#!/usr/bin/env python3
"""Pull Morpho lending markets on Robinhood Chain.

Exit capacity only means something next to what is standing behind it. This
fetches the borrow and collateral figures the coverage ratio is measured
against, so no number on the leaderboard is hardcoded.

Read-only, no key required.
"""

import json
import urllib.request

API = "https://blue-api.morpho.org/graphql"
CHAIN_ID = 4663

QUERY = """
{
  markets(where: { chainId_in: [%d] }, first: 200) {
    items {
      marketId
      lltv
      listed
      badDebt { usd }
      collateralAsset { symbol address decimals }
      loanAsset { symbol address decimals }
      state {
        borrowAssetsUsd
        collateralAssetsUsd
        supplyAssetsUsd
        utilization
        borrowApy
        supplyApy
      }
    }
  }
}
""" % CHAIN_ID


def fetch():
    request = urllib.request.Request(
        API,
        data=json.dumps({"query": QUERY}).encode(),
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        payload = json.load(response)
    if "errors" in payload:
        raise RuntimeError(f"Morpho API: {payload['errors']}")
    return payload["data"]["markets"]["items"]


def main():
    markets = []
    for item in fetch():
        state = item.get("state") or {}
        collateral = item.get("collateralAsset") or {}
        loan = item.get("loanAsset") or {}
        bad_debt = (item.get("badDebt") or {}).get("usd")
        markets.append({
            "marketId": item.get("marketId"),
            "collateral_symbol": collateral.get("symbol"),
            "collateral_address": collateral.get("address"),
            "collateral_decimals": collateral.get("decimals"),
            "loan_symbol": loan.get("symbol"),
            "loan_address": loan.get("address"),
            "lltv_pct": round(int(item["lltv"]) / 1e16, 2) if item.get("lltv") else None,
            "listed": item.get("listed"),
            "borrow_usd": round(float(state.get("borrowAssetsUsd") or 0), 2),
            "collateral_usd": round(float(state.get("collateralAssetsUsd") or 0), 2),
            "supply_usd": round(float(state.get("supplyAssetsUsd") or 0), 2),
            "utilization": round(float(state.get("utilization") or 0), 4),
            "borrow_apy": round(float(state.get("borrowApy") or 0), 4),
            "supply_apy": round(float(state.get("supplyApy") or 0), 4),
            "bad_debt_usd": round(float(bad_debt), 2) if bad_debt else 0.0,
        })

    markets.sort(key=lambda m: -m["borrow_usd"])
    print(json.dumps({
        "chainId": CHAIN_ID,
        "source": "Morpho Blue API",
        "market_count": len(markets),
        "total_borrow_usd": round(sum(m["borrow_usd"] for m in markets), 2),
        "total_collateral_usd": round(sum(m["collateral_usd"] for m in markets), 2),
        "total_bad_debt_usd": round(sum(m["bad_debt_usd"] for m in markets), 2),
        "markets": markets,
    }, indent=2))


if __name__ == "__main__":
    main()
