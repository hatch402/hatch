# LASTOUT

**Liquidation coverage for Robinhood Chain.** We measure how much collateral can actually exit on-chain.

> Don't be last out.

---

## The problem

A lending market reports collateral, LLTV, and utilization. None of those tell you the thing that decides whether a liquidation succeeds: **how much of that collateral a liquidator can actually sell before the exit runs dry.**

On Robinhood Chain (chain ID `4663`) that question has an unusually hard answer, because a liquidator's venue options are almost entirely closed:

| Venue | Callable by a contract? | Why |
|---|---|---|
| Uniswap v4 (raw pools) | **Yes** | Direct `PoolManager` calls |
| 0x Swap API | No | Returns `TOKEN_NOT_AUTHORIZED_FOR_TRADE` for stock tokens |
| Arcus | No | Orders signed off-chain via embedded wallet; geo/key gated |
| Lighter | No | Orders signed off-chain to a sequencer |
| Meridian | No | RFQ, off-chain order flow |
| UniswapX | No | Reactor address carries no code on this chain |

So for an automated liquidator, **raw Uniswap v4 is effectively the only exit.** That makes exit capacity measurable — and worth measuring.

---

## What we measured

Measured 2026-07-25 at block `18703866` on Robinhood Chain mainnet. Every number below is reproducible with the script in `probe/`.

Morpho on Robinhood Chain carries **$205,661,243** of borrow across 37 markets. Three markets hold effectively all of it:

| Market | Collateral | Max atomic exit | Coverage |
|---|---|---|---|
| USDe / USDG | $175,005,841 | $549,890 | **0.314%** |
| syrupUSDG / USDG | $47,129,615 | $2,013,158 | **4.272%** |
| spUSDG / USDG | $15,899,540 | **$1,011** | **0.0064%** |
| **Total** | **$238,034,996** | **$2,564,059** | **1.0772%** |

**Ratio: 92.8 : 1.** For every dollar that can leave, ninety-two are waiting behind it.

### Where each pool runs dry

The exits do not degrade gradually. They stop.

**USDe → USDG** (`fee=100`, `tickSpacing=1`)

| Size in | USDG out | Slippage vs $10k rate |
|---|---|---|
| $10,000 | $9,999.92 | 0.00% |
| $250,000 | $249,768 | −0.09% |
| $500,000 | $498,931 | −0.21% |
| $1,000,000 | **$549,890** | **−45.01%** |
| $2,500,000 | $549,890 | −78.00% |

Past roughly $550k the output stops moving. Additional input buys nothing.

**spUSDG → USDG** (`fee=500`, `tickSpacing=10`) is already exhausted at the smallest size probed: a $10,000 sell returns **$919.79**. The pool holds about **$1,011** in total, against $15.9M of collateral.

### Two related facts

- **Almost the entire supply of each wrapper is locked as collateral.** spUSDG total supply is 16,018,621 and 15,899,540 of it sits in Morpho — **99.26%**. There is no meaningful float outside the lending market to act as emergency liquidity.
- **Stock tokens are not where the risk is.** Ten stock-collateral markets are deployed on Robinhood Chain. Their combined borrow is **$11.89**. The chain is marketed around tokenized equities; the leverage is entirely in stablecoin wrappers borrowing against themselves at 91.5% LLTV and ~90% utilization.

Reported bad debt across all 37 markets is **$0**. That means the exit has not been tested, not that it is wide.

---

## Reproduce it

Requires [Foundry](https://getfoundry.sh) (`cast`) and Python 3.9+.

```bash
python3 probe/exit_depth.py
```

The script ladders sell sizes for each collateral through the Uniswap v4 Quoter on the public Robinhood Chain RPC and reports where output stops responding to input. No API key, no account, no funds.

Single-market spot check:

```bash
cast call 0x8dc178efb8111bb0973dd9d722ebeff267c98f94 \
  "quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))(uint256,uint256)" \
  "((0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34,0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168,100,1,0x0000000000000000000000000000000000000000),true,1000000000000000000000000,0x)" \
  --rpc-url https://rpc.mainnet.chain.robinhood.com
```

That quotes selling 1,000,000 USDe. The USDG returned is the ceiling, not a rate.

### Addresses used

| Contract | Address |
|---|---|
| Uniswap v4 Quoter | `0x8dc178efb8111bb0973dd9d722ebeff267c98f94` |
| USDG (6 decimals) | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` |
| USDe (18 decimals) | `0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34` |
| syrupUSDG (6 decimals) | `0x40858070814a57FdF33a613ae84fE0a8b4a874f7` |
| spUSDG (6 decimals) | `0xde770c84FE66E063336b31737cFE9790f18c4087` |

RPC: `https://rpc.mainnet.chain.robinhood.com` · Chain ID `4663`

---

## Known limitations

Stated plainly, because they change how the numbers should be read.

1. **Quoted, not executed.** Depth comes from Uniswap v4 Quoter view calls. A quote and a settled swap can disagree when hooks or transfer restrictions are involved. Execution simulation through a router is the next step, and it may move these numbers.
2. **Swap exits only.** Some collateral may have a non-swap exit — Ethena redemption for USDe, Maple withdrawal for syrupUSDG, protocol unwrap paths. If liquidators use those instead of pools, pool depth is the wrong denominator and coverage is understated. **This is the single strongest objection to everything above, and it is not yet resolved.**
3. **Point-in-time.** One measurement, one block. Liquidity moves. Coverage is only meaningful as a time series, which starts with `data/`.
4. **Coverage is not a forecast.** A low ratio says an orderly exit at size is unavailable today. It does not predict a liquidation event, and it says nothing about whether one will occur.

---

## Status

Early. Measuring in public while validating whether anyone needs this measured. Snapshots land in `data/` as they are taken.

## License

All rights reserved. Published for inspection and verification, not for reuse.

## Disclaimer

Not affiliated with, endorsed by, sponsored by, or connected to Robinhood Markets, Inc. or any of its subsidiaries. Nothing here is financial, investment, or legal advice. Every figure is a measurement of on-chain state at a stated block, reproducible from the commands above — check them yourself rather than taking ours.
