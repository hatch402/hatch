import Console from "../components/Console";
import Placard from "../components/Placard";
import Markets from "../components/Markets";
import Ladder from "../components/Ladder";
import Evidence from "../components/Evidence";
import Nav from "../components/Nav";
import Gauge from "../components/Gauge";
import Api from "../components/Api";
import Link from "next/link";
import Reveal from "../components/Reveal";
import { coverage } from "../lib/coverage";
import styles from "./page.module.css";

export default function Home() {
  const c = coverage;

  return (
    <main>
      <Nav />

      <section className={styles.hero}>
        <div className="shell">
          <p className="stamp">Liquidation coverage · Robinhood Chain</p>
          <h1 className={`display ${styles.headline}`}>
            We measure the door.
            <br />
            <span className={styles.quiet}>Not the fire.</span>
          </h1>
        </div>

        <div className={`shell ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <p className={styles.lede}>
              A lending market reports collateral, LLTV and utilization. None of them tell you
              whether a liquidator can actually get out. We measure the exit — every day, against
              the venues a contract can actually reach on this chain.
            </p>
            <p className={styles.sub}>
              Bad debt across these markets is currently zero. Coverage is not a forecast; it is the
              width of the door as of block {c.pool_block}.
            </p>
            <Gauge />
          </div>

          <div className={styles.heroConsole}>
            <Console />
          </div>
        </div>
      </section>

      <Reveal>
        <section className={styles.section} id="scale">
          <div className="shell">
            <p className="stamp">To scale</p>
            <h2 className={`display ${styles.h2}`}>
              {c.bridged_ratio.toFixed(1)} to 1
            </h2>
            <Placard />
          </div>
        </section>
      </Reveal>

      <Ladder />

      <Reveal>
        <section className={styles.section} id="mechanism">
          <div className="shell">
            <p className="stamp">Two doors</p>
            <div className={styles.doors}>
              <article className={styles.door}>
                <h3 className={styles.doorTitle}>Redeem it</h3>
                <p className={styles.doorBody}>
                  If the backing sits on this chain, a liquidator hands the token back and takes the
                  asset. Bounded by what the vault actually holds, not by anyone&rsquo;s willingness
                  to buy.
                </p>
                <p className={styles.doorNote}>spUSDG holds its USDG here. It can do this.</p>
              </article>
              <article className={`${styles.door} ${styles.doorShut}`}>
                <h3 className={styles.doorTitle}>Sell it</h3>
                <p className={styles.doorBody}>
                  If the backing lives elsewhere, the only move is a pool. A contract can reach
                  Uniswap v4 and a v2 factory here, and nothing else — 0x rejects these assets,
                  Arcus and Lighter take orders signed off-chain, the UniswapX reactor carries no
                  code. Both are measured; for these assets v2 holds about $2,000.
                </p>
                <p className={styles.doorNote}>
                  USDe and syrupUSDG are in this column. It is the whole exit.
                </p>
              </article>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className={styles.section} id="evidence">
          <div className="shell">
            <p className="stamp">Not an assumption</p>
            <h2 className={`display ${styles.h2}`}>Seven liquidations have already run here</h2>
            <p className={styles.lede}>
              Coverage assumes a liquidator converts seized collateral through a pool, atomically.
              That does not have to be assumed. Morpho has processed seven liquidations on this
              chain, and one of them shows the whole sequence.
            </p>
            <Evidence />
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className={styles.section} id="markets">
          <div className="shell">
            <p className="stamp">By market</p>
            <Markets />
            <p className={styles.footnote}>
              {c.market_count} markets carry {" "}
              <b>${c.total_borrow_usd.toLocaleString("en-US", { maximumFractionDigits: 0 })}</b> of
              borrow between them. Only the rows above hold meaningful exposure. Markets with
              exposure but no probe read <i>not measured</i> — they are never counted as covered.
            </p>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className={styles.section} id="api">
          <div className="shell">
            <p className="stamp">For machines</p>
            <h2 className={`display ${styles.h2}`}>Priced per question, paid onchain</h2>
            <p className={styles.lede}>
              An agent sizing a trade, or a curator sizing a market, needs one thing this page
              cannot give: the answer for <em>their</em> size. That is what the endpoint is for.
            </p>
            <Api />
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className={styles.section} id="verify">
          <div className="shell">
            <p className="stamp">Check it yourself</p>
            <h2 className={`display ${styles.h2}`}>Every figure has a command</h2>
            <p className={styles.lede}>
              Nothing here needs an API key, an account, or funds. Run{" "}
              <code className={styles.code}>last/proof USDe</code> in the console above and paste
              what it gives you into a terminal. If our number is wrong, that is how you find out.
            </p>
            <div className={styles.links}>
              <a className={styles.link} href="https://github.com/lastoutxyz/lastout-x402">
                Source and daily snapshots →
              </a>
              <Link className={styles.link} href="/docs">
                Method in full →
              </Link>
              <a className={styles.link} href="https://x.com/lastoutlabs">
                @lastoutlabs →
              </a>
            </div>
          </div>
        </section>
      </Reveal>

      <footer className={styles.footer}>
        <div className="shell">
          <hr className="rule" />
          <p className={styles.small}>
            Not affiliated with, endorsed by, sponsored by, or connected to Robinhood Markets, Inc.
            or any of its subsidiaries. Nothing here is financial, investment or legal advice. Every
            figure is a measurement of on-chain state at a stated block.
          </p>
          <p className={styles.small}>
            <span className={styles.wordmarkSmall}>
              LAST<b>OUT</b>
            </span>{" "}
            — don&rsquo;t be last out.
          </p>
        </div>
      </footer>
    </main>
  );
}
