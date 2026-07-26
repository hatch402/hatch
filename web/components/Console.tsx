"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { coverage, canExit, findMarket, usd, measured } from "../lib/coverage";
import styles from "./Console.module.css";

type Tone = "dim" | "ink" | "amber" | "ember" | "rule";
type Line = { text: string; tone?: Tone };

const PROMPT = "$";
const BOOT_COMMAND = "last/out";

const HELP: Line[] = [
  { text: "last/out                     chain-wide coverage", tone: "ink" },
  { text: "last/market <SYMBOL>         one market in detail", tone: "ink" },
  { text: "last/exit <SYMBOL> <USD>     can this size get out?", tone: "ink" },
  { text: "last/proof <SYMBOL>          the command to verify it yourself", tone: "ink" },
  { text: "clear                        wipe the console", tone: "ink" },
];

const ADDRESSES: Record<string, string> = {
  USDe: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34",
  syrupUSDG: "0x40858070814a57FdF33a613ae84fE0a8b4a874f7",
  spUSDG: "0xde770c84FE66E063336b31737cFE9790f18c4087",
};

function bar(pct: number, width = 34): string {
  const filled = Math.max(pct > 0 ? 1 : 0, Math.round((pct / 100) * width));
  return "█".repeat(Math.min(filled, width)) + "·".repeat(Math.max(0, width - filled));
}

function chainWide(): Line[] {
  const c = coverage;
  return [
    { text: `measured across ${measured.length} markets on chain ${c.chain_id}`, tone: "dim" },
    { text: "" },
    { text: `collateral      ${usd(c.measured_collateral_usd).padStart(14)}`, tone: "ink" },
    { text: `can exit        ${usd(c.measured_exit_usd).padStart(14)}`, tone: "ink" },
    { text: `coverage        ${(c.measured_coverage_pct.toFixed(2) + "%").padStart(14)}`, tone: "ink" },
    { text: "" },
    { text: "bridged only — the pool is the whole exit", tone: "dim" },
    { text: `collateral      ${usd(c.bridged_collateral_usd).padStart(14)}`, tone: "amber" },
    { text: `can exit        ${usd(c.bridged_exit_usd).padStart(14)}`, tone: "amber" },
    { text: `coverage        ${(c.bridged_coverage_pct.toFixed(2) + "%").padStart(14)}`, tone: "amber" },
    { text: `ratio           ${(c.bridged_ratio.toFixed(1) + " : 1").padStart(14)}`, tone: "ember" },
    { text: "" },
    { text: `pool depth at block ${c.pool_block} · redemption at block ${c.redemption_block}`, tone: "dim" },
    { text: "type  last/exit USDe 1000000  to ask about a size", tone: "dim" },
  ];
}

function marketDetail(symbol: string): Line[] {
  const m = findMarket(symbol);
  if (!m) {
    return [
      { text: `no market for "${symbol}"`, tone: "ember" },
      { text: `known: ${coverage.markets.map((x) => x.symbol).join(", ")}`, tone: "dim" },
    ];
  }
  if (!m.measured) {
    return [
      { text: `${m.symbol} / ${m.loan}`, tone: "ink" },
      { text: `collateral      ${usd(m.collateral).padStart(14)}`, tone: "ink" },
      { text: `borrowed        ${usd(m.borrow).padStart(14)}`, tone: "ink" },
      { text: "", },
      { text: "not measured — no probe for this collateral yet.", tone: "dim" },
      { text: "it is never counted as covered.", tone: "dim" },
    ];
  }
  const pct = m.coverage ?? 0;
  return [
    { text: `${m.symbol} / ${m.loan}   lltv ${m.lltv}%`, tone: "ink" },
    { text: "" },
    { text: `collateral      ${usd(m.collateral).padStart(14)}`, tone: "ink" },
    { text: `borrowed        ${usd(m.borrow).padStart(14)}`, tone: "ink" },
    { text: `pool exit       ${usd(m.pool ?? 0).padStart(14)}`, tone: "ink" },
    { text: `redemption      ${(m.redeem ? usd(m.redeem) : "none").padStart(14)}`, tone: "ink" },
    { text: "" },
    { text: `${bar(pct)}  ${pct.toFixed(2)}%`, tone: pct < 10 ? "ember" : pct < 50 ? "amber" : "ink" },
    { text: "" },
    { text: `mechanism: ${m.mechanism_label}`, tone: "dim" },
    { text: m.mechanism_note ?? "", tone: "dim" },
  ];
}

function exitAnswer(symbol: string, sizeRaw: string): Line[] {
  const size = Number(sizeRaw.replace(/[$,_]/g, ""));
  if (!Number.isFinite(size) || size <= 0) {
    return [{ text: `"${sizeRaw}" is not a size. try: last/exit USDe 1000000`, tone: "ember" }];
  }
  const result = canExit(symbol, size);
  if (!result.found) {
    return [
      { text: `no market for "${symbol}"`, tone: "ember" },
      { text: `known: ${coverage.markets.map((x) => x.symbol).join(", ")}`, tone: "dim" },
    ];
  }
  if (!result.measured) {
    return [{ text: `${result.market.symbol} is not measured yet.`, tone: "dim" }];
  }
  const { market, ceiling, clears, shortfall, slippage } = result;
  const head = clears
    ? { text: `YES — ${usd(size)} of ${market.symbol} can exit.`, tone: "ink" as Tone }
    : { text: `NO — ${usd(size)} of ${market.symbol} cannot exit.`, tone: "ember" as Tone };
  const lines: Line[] = [
    head,
    { text: "" },
    { text: `max exit        ${usd(ceiling).padStart(14)}`, tone: "ink" },
    { text: `you asked for   ${usd(size).padStart(14)}`, tone: "ink" },
  ];
  if (!clears) {
    lines.push({ text: `short by        ${usd(shortfall).padStart(14)}`, tone: "ember" });
  } else if (slippage !== null) {
    lines.push({ text: `slippage        ${(slippage.toFixed(2) + "%").padStart(14)}`, tone: "dim" });
  }
  lines.push({ text: "" });
  lines.push({ text: `via ${market.mechanism_label}. run last/proof ${market.symbol} to check it yourself.`, tone: "dim" });
  return lines;
}

function proof(symbol: string): Line[] {
  const m = findMarket(symbol);
  const address = m ? ADDRESSES[m.symbol] : undefined;
  if (!m || !address) {
    return [{ text: `no proof command for "${symbol}"`, tone: "ember" }];
  }
  const isVault = m.mechanism === "REDEEMABLE";
  return [
    { text: isVault ? "preview redeeming 10,000,000 units:" : "quote selling 1,000,000 units into the pool:", tone: "dim" },
    { text: "" },
    ...(isVault
      ? [
          { text: `cast call ${address} \\`, tone: "ink" as Tone },
          { text: `  "previewRedeem(uint256)(uint256)" 10000000000000 \\`, tone: "ink" as Tone },
          { text: "  --rpc-url https://rpc.mainnet.chain.robinhood.com", tone: "ink" as Tone },
        ]
      : [
          { text: "cast call 0x8dc178efb8111bb0973dd9d722ebeff267c98f94 \\", tone: "ink" as Tone },
          { text: '  "quoteExactInputSingle(((address,address,uint24,int24,address),bool,uint128,bytes))(uint256,uint256)" \\', tone: "ink" as Tone },
          { text: `  "((${address},0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168,100,1,0x0000000000000000000000000000000000000000),true,1000000000000,0x)" \\`, tone: "ink" as Tone },
          { text: "  --rpc-url https://rpc.mainnet.chain.robinhood.com", tone: "ink" as Tone },
        ]),
    { text: "" },
    { text: "no key, no account, no funds. the number returned is a ceiling, not a rate.", tone: "dim" },
  ];
}

function run(input: string): Line[] {
  const [command, ...args] = input.trim().split(/\s+/);
  switch (command) {
    case "":
      return [];
    case "help":
      return HELP;
    case "last/out":
      return chainWide();
    case "last/market":
      return args[0] ? marketDetail(args[0]) : [{ text: "usage: last/market <SYMBOL>", tone: "dim" }];
    case "last/exit":
      return args[0] && args[1]
        ? exitAnswer(args[0], args[1])
        : [{ text: "usage: last/exit <SYMBOL> <USD>", tone: "dim" }];
    case "last/proof":
      return args[0] ? proof(args[0]) : [{ text: "usage: last/proof <SYMBOL>", tone: "dim" }];
    default:
      return [
        { text: `unknown command: ${command}`, tone: "ember" },
        { text: "type help", tone: "dim" },
      ];
  }
}

export default function Console() {
  const [history, setHistory] = useState<{ input: string; output: Line[] }[]>([]);
  const [typed, setTyped] = useState("");
  const [entry, setEntry] = useState("");
  const [booted, setBooted] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Page-load sequence: the console runs the product rather than describing it.
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      setTyped(BOOT_COMMAND);
      setHistory([{ input: BOOT_COMMAND, output: chainWide() }]);
      setBooted(true);
      return;
    }
    let index = 0;
    const typing = setInterval(() => {
      index += 1;
      setTyped(BOOT_COMMAND.slice(0, index));
      if (index >= BOOT_COMMAND.length) {
        clearInterval(typing);
        setTimeout(() => {
          setHistory([{ input: BOOT_COMMAND, output: chainWide() }]);
          setBooted(true);
        }, 260);
      }
    }, 62);
    return () => clearInterval(typing);
  }, []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [history]);

  const commit = useCallback(() => {
    const input = entry;
    setEntry("");
    if (input.trim() === "clear") {
      setHistory([]);
      return;
    }
    setHistory((prev) => [...prev, { input, output: run(input) }]);
  }, [entry]);

  const submit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      commit();
    },
    [commit],
  );

  // Implicit form submission is not dependable for a single-field form with no
  // submit button, and a console that ignores Enter is not a console.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") {
        event.preventDefault();
        commit();
      }
    },
    [commit],
  );

  return (
    <div className={styles.console} onClick={() => inputRef.current?.focus()}>
      <div className={styles.chrome}>
        <span className={styles.label}>LASTOUT CONSOLE</span>
        <span className={styles.meta}>CHAIN 4663 · READ ONLY</span>
      </div>

      <div className={styles.body} ref={bodyRef} aria-live="polite">
        {history.length === 0 && (
          <div className={styles.row}>
            <span className={styles.prompt}>{PROMPT}</span>
            <span className={styles.cmd}>
              {typed}
              <i className={styles.caret} />
            </span>
          </div>
        )}

        {history.map((item, i) => (
          <div key={i}>
            <div className={styles.row}>
              <span className={styles.prompt}>{PROMPT}</span>
              <span className={styles.cmd}>{item.input}</span>
            </div>
            {item.output.map((line, j) => (
              <div
                key={j}
                className={`${styles.out} ${line.tone ? styles[line.tone] : ""}`}
                style={{ animationDelay: `${Math.min(j * 34, 500)}ms` }}
              >
                {line.text || " "}
              </div>
            ))}
          </div>
        ))}

        {booted && (
          <form onSubmit={submit} className={styles.row}>
            <span className={styles.prompt}>{PROMPT}</span>
            <input
              ref={inputRef}
              className={styles.input}
              value={entry}
              onChange={(e) => setEntry(e.target.value)}
              onKeyDown={onKeyDown}
              spellCheck={false}
              autoComplete="off"
              aria-label="Console command"
              placeholder="last/exit USDe 1000000"
            />
            <button type="submit" className="sr-only">
              Run command
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
