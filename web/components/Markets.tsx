import { coverage, usd } from "../lib/coverage";
import styles from "./Markets.module.css";

export default function Markets() {
  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Market</th>
            <th className={styles.num}>Collateral</th>
            <th className={styles.num}>Borrowed</th>
            <th className={styles.num}>Max exit</th>
            <th>Mechanism</th>
            <th className={styles.num}>Coverage</th>
          </tr>
        </thead>
        <tbody>
          {coverage.markets.map((m) => {
            if (!m.measured) {
              return (
                <tr key={m.symbol} className={styles.faded}>
                  <td className={styles.sym}>
                    {m.symbol} <span className={styles.loan}>/ {m.loan}</span>
                  </td>
                  <td className={styles.num}>{usd(m.collateral)}</td>
                  <td className={styles.num}>{usd(m.borrow)}</td>
                  <td colSpan={3} className={styles.note}>
                    not measured
                  </td>
                </tr>
              );
            }
            const pct = m.coverage ?? 0;
            const tone = pct >= 50 ? styles.ok : pct >= 10 ? styles.warn : styles.bad;
            return (
              <tr key={m.symbol}>
                <td className={styles.sym}>
                  {m.symbol} <span className={styles.loan}>/ {m.loan}</span>
                </td>
                <td className={styles.num}>{usd(m.collateral)}</td>
                <td className={styles.num}>{usd(m.borrow)}</td>
                <td className={styles.num}>{usd(m.best ?? 0)}</td>
                <td>
                  <span className={`${styles.tag} ${tone}`}>{m.mechanism_label}</span>
                </td>
                <td className={styles.num}>
                  <span className={`${styles.pct} ${tone}`}>{pct.toFixed(2)}%</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
