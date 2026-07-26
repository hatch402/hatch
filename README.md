# LASTOUT

**Liquidation coverage for Robinhood Chain.** We measure how much collateral can actually exit on-chain.

> Don't be last out.

---

> ### Correction, 2026-07-25
>
> The first version of this README reported chain-wide coverage of **1.08%** and gave spUSDG an exit of **$1,011**. That was wrong. It measured pool depth only, and spUSDG turns out to be an ERC-4626 vault holding its backing on this chain — it can be redeemed directly for roughly **$15.0M**, not sold for $1,011.
>
> Corrected figures are below. Chain-wide coverage is **7.40%**, not 1.08%. The finding survives the correction, but it is a different and narrower finding than first published, and it now names the mechanism rather than just a number. The commit history contains both versions.

---

## The problem

A lending market reports collateral, LLTV, and utilization. None of those tell you the thing that decides whether a liquidation succeeds: **how much of that collateral can actually be turned into the loan asset, right now, in one transaction.**

There are two ways out, and they are not equivalent:

1. **Sell it into a pool.** Bounded by pool depth. Available to any contract.
2. **Redeem it for its backing.** Bounded by whether the backing is on this chain at all.

Most coverage analysis measures only the first. That understates coverage for assets that can be redeemed, and it says nothing useful unless you check which case applies.

On Robinhood Chain (chain ID `4663`) the selling side is unusually constrained, because a liquidator contract's venue options are almost entirely closed:

| Venue | Callable by a contract? | Why |
|---|---|---|
| Uniswap v4 (raw pools) | **Yes** | Direct `PoolManager` calls |
| Uniswap v2 (factory `0x8bcEaA40…`) | **Yes** | Live here, and used in a real liquidation on this chain |
| 0x Swap API | No | Returns `TOKEN_NOT_AUTHORIZED_FOR_TRADE` for stock tokens |
| Arcus | No | Orders signed off-chain via embedded wallet; geo/key gated |
| Lighter | No | Orders signed off-chain to a sequencer |
| Meridian | No | RFQ, off-chain order flow |
| UniswapX | No | Reactor address carries no code on this chain |

So when redemption is unavailable, the pools are the whole exit.

---

## What we measured

Robinhood Chain mainnet, 2026-07-25. Pool depth at block `18957397`, redemption paths at block `19388795`. Both reproducible with the scripts in `probe/`.

Morpho on Robinhood Chain carries **$205,661,243** of borrow across 37 markets. Three markets hold effectively all of it.

| Market | Collateral | Pool exit | Redemption exit | Best exit | Coverage |
|---|---|---|---|---|---|
| USDe / USDG | $175,005,841 | $563,090 | — | $563,090 | **0.32%** |
| syrupUSDG / USDG | $47,129,615 | $2,013,158 | — | $2,013,158 | **4.27%** |
| spUSDG / USDG | $15,899,540 | $1,011 | **$15,048,106** | $15,048,106 | **94.64%** |
| **Total** | **$238,034,996** | | | **$17,624,354** | **7.40%** |

### The finding is the split, not the total

The chain-wide 7.40% is an average across two very different situations.

| | Collateral | Exit | Coverage |
|---|---|---|---|
| Locally redeemable (spUSDG) | $15,899,540 | $15,048,106 | **94.64%** |
| Bridged, pool-only (USDe + syrupUSDG) | **$222,135,456** | **$2,576,248** | **1.16%** |

**$222,135,456 of collateral has no redemption path on this chain and $2,576,248 of pool behind it. That is 86.2 to 1.**

- **spUSDG** is an ERC-4626 vault whose `asset()` is USDG, holding **$16,454,798** of USDG idle against a 16,406,686 supply. `previewRedeem` returns cleanly up to 15,000,000 units. No pause function, no whitelist gate found. Its pool is nearly empty — $1,011 — and that does not matter, because nobody needs the pool.
- **USDe** is a LayerZero OFT (endpoint `0x6F475642a6e85809B1c36Fa62763669b1b48DD5B`). It is a bridged representation. Redeeming it for backing means leaving Robinhood Chain first, which is not atomic and not something a liquidator can do inside one transaction. Its exit here is the pool.
- **syrupUSDG** is an AccessControl ERC-20 whose `MINTER_ROLE` and `BURNER_ROLE` are both held by a single contract, `0x01fa676ecc8662e6923fdf06ba5278a96ccd725c`. That contract holds **0 USDG**. Burning syrupUSDG here destroys the token; any credit is issued on another chain, asynchronously. With no backing held locally there is nothing to redeem against, so the pool is its only atomic exit. 47,055,013 of its 48,056,925 supply — **97.9%** — sits in the Morpho market.

### Where the pools run dry

The pool exits do not degrade gradually. They stop.

**USDe → USDG** (`fee=100`, `tickSpacing=1`)

| Size in | USDG out | Slippage vs $10k rate |
|---|---|---|
| $10,000 | $10,000.55 | 0.00% |
| $250,000 | $249,796 | −0.09% |
| $500,000 | $498,992 | −0.21% |
| $1,000,000 | **$563,090** | **−43.69%** |
| $2,500,000 | $563,090 | −77.48% |

Past roughly $563k the output stops moving. Additional input buys nothing.

### Two related facts

- **Almost the entire supply of each wrapper is locked as collateral.** spUSDG total supply is 16,406,686 and 15,899,540 of it sits in Morpho — **96.9%**. There is little float outside the lending market to act as emergency liquidity.
- **Stock tokens are not where the risk is.** Ten stock-collateral markets are deployed on Robinhood Chain. Their combined borrow is **$11.89**. The chain is marketed around tokenized equities; the leverage is entirely in stablecoin wrappers borrowing against themselves at 91.5% LLTV and ~90% utilization.

Reported bad debt across all 37 markets is **$0**. That means the exit has not been tested, not that it is wide.

---

## Reproduce it

Requires [Foundry](https://getfoundry.sh) (`cast`) and Python 3.9+.

```bash
python3 probe/exit_depth.py    # pool depth, laddered
python3 probe/redemption.py    # local redemption paths
```

Neither script needs an API key, an account, or funds. Both are read-only.

Single spot check — quote selling 1,000,000 USDe into the pool:

```bash
cast call 0x8dc178efb8111bb0973dd9d722ebeff267c98f94 \
  "quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))(uint256,uint256)" \
  "((0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34,0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168,100,1,0x0000000000000000000000000000000000000000),true,1000000000000000000000000,0x)" \
  --rpc-url https://rpc.mainnet.chain.robinhood.com
```

The USDG returned is a ceiling, not a rate.

Redemption spot check — preview redeeming 10,000,000 spUSDG:

```bash
cast call 0xde770c84FE66E063336b31737cFE9790f18c4087 \
  "previewRedeem(uint256)(uint256)" 10000000000000 \
  --rpc-url https://rpc.mainnet.chain.robinhood.com
```

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

1. **A quote is not a guarantee of capacity.** `previewRedeem` reports what the vault would pay, but the backing can be drawn down by other redeemers between the measurement and the liquidation. Redemption coverage is a snapshot of a moving balance — spUSDG's idle USDG moved by roughly $374,000 during a single afternoon of measurement.
2. **Quoted, not executed.** Pool depth comes from Uniswap v4 Quoter view calls and redemption from `previewRedeem`. A quote and a settled transaction can disagree when hooks or transfer restrictions are involved. Execution simulation is the next step.
3. **Redemption capacity is not static.** spUSDG is redeemable because the vault currently holds the USDG. That balance can be drawn down by other redeemers. Coverage measured once is coverage at one block.
4. **Point-in-time.** Two blocks, minutes apart. Liquidity moves. Coverage is only meaningful as a time series, which starts in `data/`.
5. **Coverage is not a forecast.** A low ratio says an orderly exit at size is unavailable today. It does not predict a liquidation event, and it says nothing about whether one will occur.

---

## Status

Early. Measuring in public, and correcting in public when the measurement is wrong — see the correction at the top. Snapshots land in `data/` as they are taken.

## License

All rights reserved. Published for inspection and verification, not for reuse.

## Disclaimer

Not affiliated with, endorsed by, sponsored by, or connected to Robinhood Markets, Inc. or any of its subsidiaries. Nothing here is financial, investment, or legal advice. Every figure is a measurement of on-chain state at a stated block, reproducible from the commands above — check them yourself rather than taking ours.
