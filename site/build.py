#!/usr/bin/env python3
"""Build the public liquidation-coverage leaderboard.

Reads the most recent snapshots in data/ and writes a self-contained page to
docs/index.html with the figures inlined. Self-contained on purpose: no fetch,
no CORS, no build step at view time, and the page stays readable if it is saved
or mirrored anywhere.

Markets we have not probed are shown as not measured. They are never silently
counted as covered.
"""

import glob
import json
import os
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "docs" / "index.html"

# Only markets with real exposure are worth a coverage row.
BORROW_FLOOR_USD = 1_000

MECHANISM_LABEL = {
    "REDEEMABLE": ("redeemable", "Backing held on this chain; redeemable at size."),
    "BRIDGED": ("bridged", "LayerZero OFT. Redemption requires leaving this chain."),
    "BRIDGE_MINTED": ("bridge-minted", "Single mint/burn authority holding no backing here."),
    "NONE_FOUND": ("unidentified", "No local redemption path identified."),
}


def latest(prefix):
    files = sorted(glob.glob(str(DATA / f"{prefix}-*.json")))
    if not files:
        raise SystemExit(f"no {prefix} snapshot in data/")
    with open(files[-1]) as handle:
        return json.load(handle), os.path.basename(files[-1])


def money(value):
    return f"${value:,.0f}"


def build():
    markets_doc, markets_file = latest("markets")
    pool_doc, pool_file = latest("pool-depth")
    redeem_doc, redeem_file = latest("redemption")

    pool_exit = {m["symbol"]: (m.get("max_atomic_exit_usdg") or 0)
                 for m in pool_doc["markets"]}
    redemption = {c["symbol"]: c for c in redeem_doc["collateral"]}

    rows, measured_collateral, measured_exit = [], 0.0, 0.0
    bridged_collateral, bridged_exit = 0.0, 0.0

    for market in markets_doc["markets"]:
        if market["borrow_usd"] < BORROW_FLOOR_USD:
            continue
        symbol = market["collateral_symbol"] or "?"
        collateral = market["collateral_usd"]
        redeem_info = redemption.get(symbol)

        if redeem_info is None:
            rows.append({
                "symbol": symbol, "loan": market["loan_symbol"],
                "collateral": collateral, "borrow": market["borrow_usd"],
                "lltv": market["lltv_pct"], "measured": False,
            })
            continue

        pool = pool_exit.get(symbol, 0)
        redeem = redeem_info.get("max_verified_redemption_usdg") or 0
        best = min(max(pool, redeem), collateral) if collateral else 0
        coverage = (best / collateral * 100) if collateral else 0
        mechanism = redeem_info.get("local_exit", "NONE_FOUND")

        measured_collateral += collateral
        measured_exit += best
        if mechanism != "REDEEMABLE":
            bridged_collateral += collateral
            bridged_exit += best

        rows.append({
            "symbol": symbol, "loan": market["loan_symbol"],
            "collateral": collateral, "borrow": market["borrow_usd"],
            "lltv": market["lltv_pct"], "measured": True,
            "pool": pool, "redeem": redeem, "best": best,
            "coverage": coverage, "mechanism": mechanism,
        })

    rows.sort(key=lambda r: -r["collateral"])
    overall = (measured_exit / measured_collateral * 100) if measured_collateral else 0
    bridged_pct = (bridged_exit / bridged_collateral * 100) if bridged_collateral else 0
    bridged_ratio = (bridged_collateral / bridged_exit) if bridged_exit else 0

    table_rows = []
    for row in rows:
        if not row["measured"]:
            table_rows.append(f"""      <tr class="unmeasured">
        <td class="sym">{row['symbol']} <span class="loan">/ {row['loan']}</span></td>
        <td class="num">{money(row['collateral'])}</td>
        <td class="num">{money(row['borrow'])}</td>
        <td colspan="3" class="note-cell">not measured</td>
      </tr>""")
            continue
        label, _ = MECHANISM_LABEL.get(row["mechanism"], ("unknown", ""))
        state = "ok" if row["coverage"] >= 50 else ("warn" if row["coverage"] >= 10 else "bad")
        bar = max(row["coverage"], 0.4)
        table_rows.append(f"""      <tr>
        <td class="sym">{row['symbol']} <span class="loan">/ {row['loan']}</span></td>
        <td class="num">{money(row['collateral'])}</td>
        <td class="num">{money(row['borrow'])}</td>
        <td class="num">{money(row['best'])}</td>
        <td class="mech"><span class="tag {state}">{label}</span></td>
        <td class="cov">
          <div class="bar"><i class="{state}" style="width:{bar:.2f}%"></i></div>
          <span class="pct {state}">{row['coverage']:.2f}%</span>
        </td>
      </tr>""")

    html = f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>HATCH — liquidation coverage on Robinhood Chain</title>
<meta name="description" content="How much lending collateral on Robinhood Chain can actually exit on-chain. Measured daily, reproducible.">
<style>
:root{{--bg:#FCFCFC;--surface:#F4F3EF;--line:#E3E1DA;--ink:#16181C;--mut:#6B6E76;--dim:#8B8E96;--amber:#EA8C00;--bad:#B42318}}
*{{box-sizing:border-box}}
body{{margin:0;background:var(--bg);color:var(--ink);
  font:14px/1.55 ui-monospace,SFMono-Regular,Menlo,monospace;-webkit-font-smoothing:antialiased}}
.wrap{{max-width:1100px;margin:0 auto;padding:56px 24px 80px}}
header{{display:flex;justify-content:space-between;align-items:flex-start;gap:24px;flex-wrap:wrap;margin-bottom:44px}}
.mark{{font-size:22px;font-weight:700;letter-spacing:.22em}}
.mark b{{color:var(--amber)}}
.tag-line{{color:var(--mut);font-size:12.5px;margin-top:7px;letter-spacing:.02em}}
.stamp{{color:var(--dim);font-size:11.5px;text-align:right;letter-spacing:.04em;line-height:1.9}}
.head{{font-size:10.5px;letter-spacing:.19em;text-transform:uppercase;color:var(--mut);margin:0 0 12px}}
.cards{{display:grid;grid-template-columns:repeat(auto-fit,minmax(228px,1fr));gap:14px;margin-bottom:46px}}
.card{{border:1px solid var(--line);border-radius:9px;padding:17px 19px;background:var(--surface)}}
.card .v{{font-size:29px;font-weight:700;letter-spacing:-.02em;margin-top:3px}}
.card .s{{color:var(--dim);font-size:11.5px;margin-top:5px}}
.card.alert{{border-color:var(--amber)}}
.card.alert .v{{color:var(--amber)}}
.tablewrap{{overflow-x:auto;border:1px solid var(--line);border-radius:9px}}
table{{width:100%;border-collapse:collapse;min-width:760px}}
th{{text-align:left;font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--mut);
  font-weight:600;padding:12px 16px;border-bottom:1px solid var(--line);background:var(--surface)}}
th.num,td.num{{text-align:right}}
td{{padding:13px 16px;border-bottom:1px solid var(--line);font-size:12.5px}}
tr:last-child td{{border-bottom:none}}
.sym{{font-weight:700}}
.loan{{color:var(--dim);font-weight:400}}
.note-cell{{color:var(--dim);font-style:italic}}
.unmeasured td{{opacity:.62}}
.tag{{font-size:10px;padding:3px 8px;border-radius:4px;letter-spacing:.05em;white-space:nowrap;
  background:#E7E6E1;color:var(--mut)}}
.tag.bad{{background:#FBE9E7;color:var(--bad)}}
.tag.warn{{background:#FDF0DC;color:#8A5200}}
.cov{{min-width:150px}}
.bar{{height:5px;border-radius:99px;background:#E3E1DA;overflow:hidden;margin-bottom:6px}}
.bar i{{display:block;height:100%;border-radius:99px;background:var(--dim)}}
.bar i.bad{{background:var(--bad)}}
.bar i.warn{{background:var(--amber)}}
.pct{{font-size:12px;font-weight:700;color:var(--mut)}}
.pct.bad{{color:var(--bad)}}
.pct.warn{{color:var(--amber)}}
section{{margin-top:46px}}
p{{color:var(--mut);max-width:74ch;font-size:12.5px}}
code{{background:var(--surface);border:1px solid var(--line);border-radius:4px;padding:1px 5px;font-size:11.5px}}
pre{{background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:15px;
  overflow-x:auto;font-size:11.5px;color:var(--ink)}}
a{{color:var(--amber)}}
ol{{color:var(--mut);font-size:12.5px;max-width:74ch;padding-left:19px}}
li{{margin-bottom:8px}}
footer{{margin-top:56px;padding-top:22px;border-top:1px solid var(--line);color:var(--dim);font-size:11.5px;max-width:74ch}}
@media(max-width:640px){{.wrap{{padding:34px 16px 60px}}.stamp{{text-align:left}}}}
</style>
</head>
<body>
<div class="wrap">

<header>
  <div>
    <div class="mark">LAST<b>OUT</b></div>
    <div class="tag-line">Liquidation coverage on Robinhood Chain. Check the hatch before you need it.</div>
  </div>
  <div class="stamp">
    CHAIN 4663 · MORPHO<br>
    POOL DEPTH · BLOCK {pool_doc.get('block','?')}<br>
    REDEMPTION · BLOCK {redeem_doc.get('block','?')}
  </div>
</header>

<p class="head">Measured</p>
<div class="cards">
  <div class="card">
    <div class="s">Collateral measured</div>
    <div class="v">{money(measured_collateral)}</div>
    <div class="s">across {len([r for r in rows if r['measured']])} markets</div>
  </div>
  <div class="card">
    <div class="s">Can exit on-chain</div>
    <div class="v">{money(measured_exit)}</div>
    <div class="s">{overall:.2f}% coverage</div>
  </div>
  <div class="card alert">
    <div class="s">Bridged, pool is the only exit</div>
    <div class="v">{money(bridged_collateral)}</div>
    <div class="s">{money(bridged_exit)} of exit · {bridged_pct:.2f}%</div>
  </div>
  <div class="card alert">
    <div class="s">Bridged collateral to exit</div>
    <div class="v">{bridged_ratio:.1f} : 1</div>
    <div class="s">dollars waiting per dollar out</div>
  </div>
</div>

<p class="head">By market</p>
<div class="tablewrap">
  <table>
    <thead>
      <tr>
        <th>Market</th><th class="num">Collateral</th><th class="num">Borrowed</th>
        <th class="num">Max exit</th><th>Mechanism</th><th>Coverage</th>
      </tr>
    </thead>
    <tbody>
{chr(10).join(table_rows)}
    </tbody>
  </table>
</div>

<section>
  <p class="head">What this measures</p>
  <p>A liquidator has two ways to turn seized collateral into the loan asset: sell it into a pool, or
  redeem it for its backing. Coverage is the larger of the two, capped at the collateral itself.</p>
  <p>On Robinhood Chain the selling side is unusually narrow. A contract can reach Uniswap v4 and a
  v2 factory, and nothing else &mdash; 0x rejects these assets, Arcus and Lighter take orders signed
  off-chain, and the UniswapX reactor carries no code here. Both venues are measured.</p>
  <p>Markets marked <em>not measured</em> have exposure but no probe yet. They are never counted as covered.</p>
</section>

<section>
  <p class="head">Reproduce it</p>
  <pre>python3 probe/markets.py      # Morpho markets on RHC
python3 probe/exit_depth.py   # pool depth, laddered
python3 probe/redemption.py   # local redemption paths</pre>
  <p>All three are read-only and need no API key, account, or funds. Snapshots land in
  <code>data/</code> daily. Source: <a href="https://github.com/hatch402/hatch">github.com/hatch402/hatch</a></p>
</section>

<section>
  <p class="head">How to read it wrong</p>
  <ol>
    <li>Coverage is not a forecast. A low ratio says an orderly exit at size is unavailable today.
    It does not predict a liquidation, and reported bad debt across these markets is currently zero.</li>
    <li>These are quotes, not settled transactions. A quote and an executed swap can disagree where
    hooks or transfer restrictions are involved.</li>
    <li>Redemption capacity moves. It depends on backing the vault currently holds, which other
    redeemers can draw down between this measurement and any liquidation.</li>
    <li>One block is one block. The series in <code>data/</code> is the part worth trusting.</li>
  </ol>
</section>

<footer>
  Snapshots: <code>{markets_file}</code> · <code>{pool_file}</code> · <code>{redeem_file}</code><br><br>
  Not affiliated with, endorsed by, sponsored by, or connected to Robinhood Markets, Inc. or any of
  its subsidiaries. Nothing here is financial, investment, or legal advice. Every figure is a
  measurement of on-chain state at a stated block &mdash; check it yourself rather than taking ours.
</footer>

</div>
</body>
</html>
"""

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(html)

    # One joined document so every surface reads the same numbers. The static
    # page above and the web app both consume this rather than re-deriving the
    # join, which is how two surfaces start disagreeing.
    summary = {
        "generated_from": {"markets": markets_file, "pool": pool_file, "redemption": redeem_file},
        "chain_id": 4663,
        "pool_block": pool_doc.get("block"),
        "redemption_block": redeem_doc.get("block"),
        "market_count": markets_doc.get("market_count"),
        "total_borrow_usd": markets_doc.get("total_borrow_usd"),
        "total_bad_debt_usd": markets_doc.get("total_bad_debt_usd"),
        "measured_collateral_usd": round(measured_collateral, 2),
        "measured_exit_usd": round(measured_exit, 2),
        "measured_coverage_pct": round(overall, 4),
        "bridged_collateral_usd": round(bridged_collateral, 2),
        "bridged_exit_usd": round(bridged_exit, 2),
        "bridged_coverage_pct": round(bridged_pct, 4),
        "bridged_ratio": round(bridged_ratio, 2),
        "markets": [
            {**row,
             "mechanism_label": MECHANISM_LABEL.get(row.get("mechanism", ""), ("", ""))[0],
             "mechanism_note": MECHANISM_LABEL.get(row.get("mechanism", ""), ("", ""))[1]}
            for row in rows
        ],
        "ladders": {m["symbol"]: m.get("ladder", []) for m in pool_doc["markets"]},
        "redemption_detail": {c["symbol"]: c for c in redeem_doc["collateral"]},
    }
    payload = json.dumps(summary, indent=2)
    (DATA / "latest.json").write_text(payload)

    # A second copy inside web/. Vercel builds with the root directory set to
    # web/ and no longer offers the option to include files above it, so an
    # import reaching outside would break the deploy. Both files are written
    # from the same computation in the same run, so they cannot drift.
    web_data = ROOT / "web" / "data"
    web_data.mkdir(parents=True, exist_ok=True)
    (web_data / "latest.json").write_text(payload)
    print(f"wrote {OUT.relative_to(ROOT)} — {len(rows)} markets, "
          f"{overall:.2f}% overall, bridged {bridged_pct:.2f}% ({bridged_ratio:.1f}:1)")


if __name__ == "__main__":
    build()
