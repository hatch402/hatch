import styles from "./Evidence.module.css";

/** The method assumes a liquidator converts seized collateral through a pool,
 *  atomically. That is not an assumption we have to make — seven liquidations
 *  have already run here, and one of them says so plainly. */

const TX = "0xa61c0fe79608534b1e16c816f353aa6bfcb53713afeaf8563f5c6e2f40e0784c";

const STEPS = [
  {
    what: "Morpho seizes the borrower's collateral and hands it to the liquidator.",
    detail: "Liquidate · market 0x039503b6… · block 11,576,642",
  },
  {
    what: "The liquidator swaps it through a pool.",
    detail: "Swap · 0xe3d40f1c… (Uniswap v2 pair)",
  },
  {
    what: "Then through a second pool, into the loan asset.",
    detail: "Swap · 0xca46b092… → USDG",
  },
  {
    what: "The loan is repaid and the position closes.",
    detail: "USDG → Morpho Blue · 0x9D53d5E3…",
  },
];

export default function Evidence() {
  return (
    <div className={styles.wrap}>
      <div className={styles.tx}>
        <div className={styles.txHead}>
          <span className="stamp">One liquidation, start to finish</span>
          <span className={styles.hash}>{TX}</span>
        </div>
        <ul className={styles.steps}>
          {STEPS.map((step, i) => (
            <li className={styles.step} key={i}>
              <span className={styles.num}>{String(i + 1).padStart(2, "0")}</span>
              <div>
                <p className={styles.what}>{step.what}</p>
                <p className={styles.detail}>{step.detail}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className={styles.verdict}>
        <p className={styles.verdictText}>
          All four steps are in <b>one transaction</b>. The liquidator never held the collateral,
          never bridged it, never redeemed it — the position had to close in a single block, so the
          exit was whatever a pool would absorb at that moment. That is what coverage measures, and
          it is why redemption only counts when it can happen on this chain.
        </p>
      </div>
    </div>
  );
}
