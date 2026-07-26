"use client";

import { useRef } from "react";
import { motion, useScroll, useTransform, useSpring } from "framer-motion";
import { coverage, usd } from "../lib/coverage";
import styles from "./Ladder.module.css";

/** The one orchestrated moment on the page.
 *
 *  Scrolling raises the size a liquidator is trying to push through the pool.
 *  The input bar keeps growing because you can always ask for more. The output
 *  bar stops, because the pool does. Reading "the exit tops out at $563k" is a
 *  fact; watching the second bar refuse to move is the same fact you can feel.
 *
 *  Every step is a real quote from the snapshot, not an easing curve. */
export default function Ladder({ symbol = "USDe" }: { symbol?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end end"],
  });
  const progress = useSpring(scrollYProgress, { stiffness: 90, damping: 26, mass: 0.4 });

  const steps = (coverage.ladders[symbol] ?? []).filter(
    (s) => s.usdg_out !== null && s.size_in <= 2_500_000,
  );

  if (steps.length < 2) return null;

  const maxIn = steps[steps.length - 1].size_in;
  const index = useTransform(progress, [0, 1], [0, steps.length - 1]);

  const inWidth = useTransform(index, (i) => {
    const step = steps[Math.min(Math.round(i), steps.length - 1)];
    return `${(step.size_in / maxIn) * 100}%`;
  });
  const outWidth = useTransform(index, (i) => {
    const step = steps[Math.min(Math.round(i), steps.length - 1)];
    return `${((step.usdg_out ?? 0) / maxIn) * 100}%`;
  });

  return (
    <div className={styles.scroller} ref={ref} style={{ height: `${steps.length * 62}vh` }}>
      <div className={styles.sticky}>
        <div className="shell">
          <p className="stamp">Where it stops</p>
          <h2 className={`display ${styles.title}`}>
            Ask for more.
            <br />
            <span className={styles.quiet}>Get the same.</span>
          </h2>

          <div className={styles.readout}>
            {steps.map((step, i) => (
              <Row key={step.size_in} step={step} i={i} index={index} maxIn={maxIn} />
            ))}
          </div>

          <div className={styles.bars}>
            <div className={styles.barRow}>
              <span className="stamp">Selling</span>
              <div className={styles.track}>
                <motion.i className={styles.in} style={{ width: inWidth }} />
              </div>
            </div>
            <div className={styles.barRow}>
              <span className="stamp">Received</span>
              <div className={styles.track}>
                <motion.i className={styles.out} style={{ width: outWidth }} />
              </div>
            </div>
          </div>

          <p className={styles.caption}>
            {symbol} into USDG, quoted at block {coverage.pool_block}. Both bars share one scale.
            Past roughly {usd(steps[steps.length - 1].usdg_out ?? 0)}, additional input buys nothing.
          </p>
        </div>
      </div>
    </div>
  );
}

function Row({
  step,
  i,
  index,
  maxIn,
}: {
  step: { size_in: number; usdg_out: number | null; slippage_pct: number | null };
  i: number;
  index: ReturnType<typeof useTransform<number, number>>;
  maxIn: number;
}) {
  const opacity = useTransform(index, [i - 1.2, i, i + 1.2], [0.22, 1, 0.22]);
  const slip = step.slippage_pct ?? 0;
  const broken = slip < -5;
  return (
    <motion.div className={styles.row} style={{ opacity }}>
      <span className={styles.size}>{usd(step.size_in)}</span>
      <span className={styles.arrow}>→</span>
      <span className={`${styles.got} ${broken ? styles.brokenText : ""}`}>
        {usd(step.usdg_out ?? 0)}
      </span>
      <span className={`${styles.slip} ${broken ? styles.brokenText : ""}`}>
        {slip.toFixed(2)}%
      </span>
    </motion.div>
  );
}
