import styles from "./Api.module.css";

const CHALLENGE = `HTTP/1.1 402 Payment Required

{
  "x402Version": 1,
  "accepts": [{
    "scheme": "exact",
    "network": "eip155:4663",
    "asset":   "0x5fc5…d168",   // USDG
    "maxAmountRequired": "1000000"
  }]
}`;

const STEPS = [
  {
    text: (
      <>
        Call <code>/v1/exit?symbol=USDe&amp;size=1000000</code>. It answers{" "}
        <code>402</code> and tells you what it costs.
      </>
    ),
  },
  { text: <>Send the USDG to the address in the response. Your wallet, your gas, your call.</> },
  {
    text: (
      <>
        Retry with <code>X-PAYMENT: &lt;your transaction hash&gt;</code>.
      </>
    ),
  },
  { text: <>The server reads that transaction back off the chain and answers.</> },
];

export default function Api() {
  return (
    <div className={styles.wrap}>
      <div className={styles.pair}>
        <div className={styles.card}>
          <div className={styles.head}>
            <span className={styles.tier}>Free, always</span>
            <span className={styles.price}>no key, no account</span>
          </div>
          <div className={styles.body}>
            <p className={styles.what}>
              Every figure on this page, the daily snapshots in the repo, and the console above.
              Enough to check whether we are right.
            </p>
            <pre className={styles.code}>{`GET  /v1/health
git  clone lastout-x402
run  probe/exit_depth.py`}</pre>
          </div>
        </div>

        <div className={`${styles.card} ${styles.paid}`}>
          <div className={styles.head}>
            <span className={styles.tier}>Paid</span>
            <span className={styles.price}>1 USDG · 30 days</span>
          </div>
          <div className={styles.body}>
            <p className={styles.what}>
              The question the page cannot answer, because it does not know your size: can{" "}
              <em>this much</em> get out, right now, and what does it cost you.
            </p>
            <pre className={styles.code}>{CHALLENGE}</pre>
          </div>
        </div>
      </div>

      <div className={styles.flow}>
        {STEPS.map((step, i) => (
          <div className={styles.stepRow} key={i}>
            <span className={styles.stepNum}>{String(i + 1).padStart(2, "0")}</span>
            <p className={styles.stepText}>{step.text}</p>
          </div>
        ))}
      </div>

      <p className={styles.note}>
        There is no database and no wallet holding your funds here. You pay from your own wallet and
        hand over the transaction hash; the chain is the ledger, so the payment is auditable by
        anyone and there is no key on this side for anyone to take. A pass is a transaction, not an
        account.
      </p>
    </div>
  );
}
