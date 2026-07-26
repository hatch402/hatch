import Link from "next/link";
import { coverage, usd } from "../../lib/coverage";
import styles from "../page.module.css";
import docs from "./docs.module.css";

export const metadata = {
  title: "Method — LASTOUT",
  description:
    "How liquidation coverage on Robinhood Chain is measured, which addresses are read, and what the numbers do not mean.",
};

const ADDRESSES: [string, string][] = [
  ["Uniswap v4 Quoter", "0x8dc178efb8111bb0973dd9d722ebeff267c98f94"],
  ["USDG (6 decimals)", "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168"],
  ["USDe (18 decimals)", "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34"],
  ["syrupUSDG (6 decimals)", "0x40858070814a57FdF33a613ae84fE0a8b4a874f7"],
  ["spUSDG (6 decimals)", "0xde770c84FE66E063336b31737cFE9790f18c4087"],
  ["Morpho Blue", "0x9D53d5E3bd5E8d4Cbfa6DB1ca238AEA02E651010"],
];

export default function Docs() {
  const c = coverage;
  return (
    <main>
      <header className={styles.bar}>
        <div className={`shell ${styles.barInner}`}>
          <Link href="/" className={styles.wordmark}>
            LAST<b>OUT</b>
          </Link>
          <span className="stamp">Method</span>
        </div>
      </header>

      <div className={`shell ${docs.page}`}>
        <p className="stamp">Method</p>
        <h1 className={`display ${docs.h1}`}>How the number is made</h1>
        <p className={docs.lede}>
          Coverage is the share of a market&rsquo;s collateral that a liquidator could convert into
          the loan asset right now, in one transaction. Two things decide it: whether the asset can
          be redeemed for its backing on this chain, and how much of it a pool will absorb.
        </p>

        <section className={docs.section}>
          <h2 className={docs.h2}>1. Which markets</h2>
          <p className={docs.body}>
            Every Morpho market on chain 4663 is read from the Morpho API. Markets holding less than
            $1,000 of borrow are left out of the coverage table — they carry no exposure worth
            measuring. Today that leaves a handful of rows out of {c.market_count} deployed markets.
          </p>
          <p className={docs.body}>
            Markets that hold real exposure but have no probe yet are shown as{" "}
            <em>not measured</em>. They are never folded into an average. Counting an unmeasured
            market as covered would be the same error as counting a bridged one as redeemable.
          </p>
        </section>

        <section className={docs.section}>
          <h2 className={docs.h2}>2. Can it be redeemed here</h2>
          <p className={docs.body}>Each collateral is checked for a local redemption path.</p>
          <dl className={docs.defs}>
            <dt>redeemable</dt>
            <dd>
              An ERC-4626 vault whose <code>asset()</code> is the loan asset and whose backing sits
              in the contract. <code>previewRedeem</code> is laddered to find the size that still
              clears. spUSDG is in this category.
            </dd>
            <dt>bridged</dt>
            <dd>
              A LayerZero OFT. The backing lives on another chain, so redeeming means bridging out
              first — not atomic, and not something a liquidator can do inside one transaction. USDe
              is in this category.
            </dd>
            <dt>bridge-minted</dt>
            <dd>
              An AccessControl ERC-20 where a single authority holds <code>MINTER_ROLE</code> and{" "}
              <code>BURNER_ROLE</code>. If that authority holds no backing locally, burning destroys
              the token here and credits elsewhere, asynchronously. syrupUSDG is in this category.
            </dd>
            <dt>unidentified</dt>
            <dd>
              No standard interface responded. The pool is treated as the only exit, and this is
              recorded as absence of evidence rather than proof of absence.
            </dd>
          </dl>
        </section>

        <section className={docs.section}>
          <h2 className={docs.h2}>3. What a pool will absorb</h2>
          <p className={docs.body}>
            Sell sizes are laddered through the Uniswap v4 Quoter until the output stops tracking
            the input. A deliberately absurd input is then quoted to find the ceiling — in a v4 pool
            the output asymptotes to the loan asset available in range, so the number returned is a
            ceiling rather than a rate.
          </p>
          <p className={docs.body}>
            Raw Uniswap v4 is used because it is the only venue a contract can call on this chain.
            0x returns <code>TOKEN_NOT_AUTHORIZED_FOR_TRADE</code> for these assets, Arcus and
            Lighter take orders signed off-chain, Meridian is RFQ, and the UniswapX reactor address
            carries no code here.
          </p>
        </section>

        <section className={docs.section}>
          <h2 className={docs.h2}>4. Coverage</h2>
          <p className={docs.body}>
            Coverage is the larger of the two exits, capped at the collateral itself, divided by the
            collateral. The chain-wide figure is an average and hides the split that matters:
            collateral that can be redeemed locally is currently{" "}
            {(
              ((c.measured_exit_usd - c.bridged_exit_usd) /
                Math.max(c.measured_collateral_usd - c.bridged_collateral_usd, 1)) *
              100
            ).toFixed(1)}
            % covered, while the {usd(c.bridged_collateral_usd)} that cannot is{" "}
            {c.bridged_coverage_pct.toFixed(2)}% covered.
          </p>
        </section>

        <section className={docs.section}>
          <h2 className={docs.h2}>Addresses read</h2>
          <div className={docs.addrs}>
            {ADDRESSES.map(([name, addr]) => (
              <div className={docs.addr} key={addr}>
                <span className={docs.addrName}>{name}</span>
                <code className={docs.addrHex}>{addr}</code>
              </div>
            ))}
          </div>
          <p className={docs.small}>
            RPC <code>https://rpc.mainnet.chain.robinhood.com</code> · chain ID 4663
          </p>
        </section>

        <section className={docs.section}>
          <h2 className={docs.h2}>Reproduce it</h2>
          <pre className={docs.pre}>{`python3 probe/markets.py      # Morpho markets on RHC
python3 probe/exit_depth.py   # pool depth, laddered
python3 probe/redemption.py   # local redemption paths`}</pre>
          <p className={docs.body}>
            All three are read-only and need no API key, account, or funds. A dated snapshot lands
            in <code>data/</code> every day. Or run <code>last/proof USDe</code> in the console on
            the front page and paste what it hands you into a terminal.
          </p>
        </section>

        <section className={docs.section}>
          <h2 className={docs.h2}>What these numbers are not</h2>
          <ol className={docs.list}>
            <li>
              <b>Not a forecast.</b> A low ratio says an orderly exit at size is unavailable today.
              It does not predict a liquidation, and reported bad debt across these markets is
              currently {usd(c.total_bad_debt_usd)}.
            </li>
            <li>
              <b>Not settled transactions.</b> Pool depth comes from Quoter calls and redemption
              from <code>previewRedeem</code>. A quote and an executed transaction can disagree
              where hooks or transfer restrictions are involved.
            </li>
            <li>
              <b>Not withdrawable supply.</b> A vault reporting available liquidity is answering a
              different question — whether a depositor can leave, not whether a liquidator can
              convert seized collateral.
            </li>
            <li>
              <b>Not static.</b> Redemption capacity depends on backing the vault holds right now,
              which other redeemers can draw down. One block is one block; the series in{" "}
              <code>data/</code> is the part worth trusting.
            </li>
          </ol>
        </section>

        <div className={styles.links}>
          <Link className={styles.link} href="/">
            ← Back to the reading
          </Link>
          <a className={styles.link} href="https://github.com/lastoutxyz/lastout-x402">
            Source and snapshots →
          </a>
        </div>
      </div>

      <footer className={styles.footer}>
        <div className="shell">
          <hr className="rule" />
          <p className={styles.small}>
            Not affiliated with, endorsed by, sponsored by, or connected to Robinhood Markets, Inc.
            or any of its subsidiaries. Nothing here is financial, investment or legal advice.
          </p>
        </div>
      </footer>
    </main>
  );
}
