"use client";

import { motion } from "framer-motion";
import { coverage, usd } from "../lib/coverage";
import styles from "./Gauge.module.css";

/** Two bars on one scale, above the fold. The point of the whole site in a
 *  single glance: this much is standing behind that much. */
export default function Gauge() {
  const c = coverage;
  const ease = [0.16, 1, 0.3, 1] as const;

  return (
    <div className={styles.gauge}>
      <div className={styles.row}>
        <div className={styles.label}>
          <span className={styles.name}>Collateral behind the door</span>
          <span className={styles.value}>{usd(c.bridged_collateral_usd)}</span>
        </div>
        <div className={styles.track}>
          <motion.i
            className={styles.fill}
            initial={{ width: 0 }}
            animate={{ width: "100%" }}
            transition={{ duration: 1.1, ease, delay: 0.25 }}
          />
        </div>
      </div>

      <div className={styles.row}>
        <div className={styles.label}>
          <span className={styles.name}>What fits through it</span>
          <span className={`${styles.value} ${styles.warn}`}>{usd(c.bridged_exit_usd)}</span>
        </div>
        <div className={styles.track}>
          <motion.i
            className={`${styles.fill} ${styles.warn}`}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(c.bridged_coverage_pct, 0.4)}%` }}
            transition={{ duration: 1.1, ease, delay: 0.55 }}
          />
        </div>
      </div>

      <motion.div
        className={styles.foot}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.5, delay: 1.35 }}
      >
        <span className={styles.ratio}>{c.bridged_ratio.toFixed(1)} : 1</span>
        <span className={styles.ratioNote}>
          dollars waiting per dollar that can leave
        </span>
      </motion.div>
    </div>
  );
}
