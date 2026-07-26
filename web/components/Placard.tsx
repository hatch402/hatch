"use client";

import { motion } from "framer-motion";
import { coverage, usd } from "../lib/coverage";
import styles from "./Placard.module.css";

/** Both bars share one scale, so width means dollars. Normalising them would
 *  make the page prettier and the comparison a lie. */
export default function Placard() {
  const c = coverage;
  const redeemable = c.measured_collateral_usd - c.bridged_collateral_usd;
  const redeemableExit = c.measured_exit_usd - c.bridged_exit_usd;
  const widest = Math.max(c.bridged_collateral_usd, redeemable);

  const rows = [
    {
      key: "redeem",
      label: "Can redeem on this chain",
      collateral: redeemable,
      exit: redeemableExit,
      constrained: false,
    },
    {
      key: "bridged",
      label: "Bridged — the pool is the whole exit",
      collateral: c.bridged_collateral_usd,
      exit: c.bridged_exit_usd,
      constrained: true,
    },
  ];

  return (
    <div className={styles.placard}>
      {rows.map((row) => {
        const width = (row.collateral / widest) * 100;
        const fill = row.collateral ? (row.exit / row.collateral) * 100 : 0;
        return (
          <div className={styles.row} key={row.key}>
            <div className={styles.head}>
              <span className="stamp">{row.label}</span>
              <span className={`${styles.pct} ${row.constrained ? styles.warn : ""}`}>
                {fill.toFixed(2)}%
              </span>
            </div>
            <motion.div
              className={styles.track}
              initial={{ width: 0 }}
              whileInView={{ width: `${width}%` }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            >
              <div
                className={`${styles.fill} ${row.constrained ? styles.fillWarn : ""}`}
                style={{ width: `${Math.max(fill, 0.35)}%` }}
              />
            </motion.div>
            <div className={styles.figures}>
              <span className={styles.big}>{usd(row.collateral)}</span>
              <span className={styles.exit}>
                exit {usd(row.exit)}
              </span>
            </div>
          </div>
        );
      })}
      <p className={styles.caption}>
        Bar width is dollars of collateral, on one shared scale. The filled portion is what can
        leave.
      </p>
    </div>
  );
}
