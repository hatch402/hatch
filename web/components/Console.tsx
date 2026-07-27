"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { coverage, canExit, findMarket, usd, measured } from "../lib/coverage";
import styles from "./Console.module.css";

type Tone = "dim" | "ink" | "amber" | "ember" | "rule";
type Line = { text: string; tone?: Tone; copy?: string };

const PROMPT = "$";
const BOOT_COMMAND = "hatch/out";
const PASS_KEY = "hatch.pass";

const HELP: Line[] = [
  { text: "hatch/out                    chain-wide coverage             free", tone: "ink" },
  { text: "hatch/market <SYMBOL>        one market in detail            free", tone: "ink" },
  { text: "hatch/exit <SYMBOL> <USD>    can this size get out?          free · daily snapshot", tone: "ink" },
  { text: "hatch/proof <SYMBOL>         the command to check it yourself  free", tone: "ink" },
  { text: "" },
  { text: "hatch/live <SYMBOL> <USD>    the same question, this block   1 USDG · 30 days", tone: "amber" },
  { text: "hatch/pay <TX HASH>          claim your payment (wallet signs it)", tone: "amber" },
  { text: "hatch/pass                   what your pass is worth", tone: "amber" },
  { text: "" },
  { text: "clear                        wipe the console", tone: "ink" },
];

const ADDRESSES: Record<string, string> = {
  USDe: "0x5d3a1Ff2b6BAb83b63cd9AD0787074081a52ef34",
  syrupUSDG: "0x40858070814a57FdF33a613ae84fE0a8b4a874f7",
  spUSDG: "0xde770c84FE66E063336b31737cFE9790f18c4087",
};

/** Mutable state the commands share: the pass, and the question a caller asked
 *  before they had one. Kept in a ref so `hatch/pay` can finish what `hatch/live`
 *  started instead of making the caller retype it. */
type Session = {
  pass: string | null;
  expiresAt: string | null;
  pending: { symbol: string; size: number } | null;
};

function bar(pct: number, width = 34): string {
  const filled = Math.max(pct > 0 ? 1 : 0, Math.round((pct / 100) * width));
  return "█".repeat(Math.min(filled, width)) + "·".repeat(Math.max(0, width - filled));
}

function parseSize(raw: string): number | null {
  const size = Number(raw.replace(/[$,_]/g, ""));
  return Number.isFinite(size) && size > 0 ? size : null;
}

/** People type "5000 USDe" as often as "USDe 5000". The two are never
 *  ambiguous — one parses as a number, the other does not — so scolding over
 *  argument order would be pedantry, not rigor. */
function symbolAndSize(a: string, b: string): { symbol: string; sizeRaw: string } {
  return parseSize(a) !== null && parseSize(b) === null
    ? { symbol: b, sizeRaw: a }
    : { symbol: a, sizeRaw: b };
}

function signed(value: number): string {
  const sign = value < 0 ? "-" : "+";
  return `${sign}${usd(Math.abs(value))}`;
}

function unknownSymbol(symbol: string): Line[] {
  return [
    { text: `no market for "${symbol}"`, tone: "ember" },
    { text: `known: ${coverage.markets.map((x) => x.symbol).join(", ")}`, tone: "dim" },
  ];
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
    { text: "type  hatch/exit USDe 1000000  to ask about a size", tone: "dim" },
  ];
}

function marketDetail(symbol: string): Line[] {
  const m = findMarket(symbol);
  if (!m) return unknownSymbol(symbol);
  if (!m.measured) {
    return [
      { text: `${m.symbol} / ${m.loan}`, tone: "ink" },
      { text: `collateral      ${usd(m.collateral).padStart(14)}`, tone: "ink" },
      { text: `borrowed        ${usd(m.borrow).padStart(14)}`, tone: "ink" },
      { text: "" },
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
  const size = parseSize(sizeRaw);
  if (size === null) {
    return [{ text: `"${sizeRaw}" is not a size. try: hatch/exit USDe 1000000`, tone: "ember" }];
  }
  const result = canExit(symbol, size);
  if (!result.found) return unknownSymbol(symbol);
  if (!result.measured) {
    return [{ text: `${result.market.symbol} is not measured yet.`, tone: "dim" }];
  }
  const { market, ceiling, clears, shortfall, slippage } = result;
  // "Exit into USDG", spelled out. The subject is collateral being turned into
  // the loan asset — without the direction, holders of the loan asset read
  // this backwards and miss that it is about the backing of their own deposit.
  const head = clears
    ? { text: `YES — ${usd(size)} of ${market.symbol} can exit into ${market.loan}.`, tone: "ink" as Tone }
    : { text: `NO — ${usd(size)} of ${market.symbol} cannot exit into ${market.loan}.`, tone: "ember" as Tone };
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
  lines.push({
    text: `answered from the snapshot at block ${coverage.pool_block}, taken once a day.`,
    tone: "dim",
  });
  lines.push({
    text: `for this block instead:  hatch/live ${market.symbol} ${size}`,
    tone: "dim",
  });
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

/* ---------------------------------------------------------------------- */
/* The paid path. Everything below talks to the real endpoint — the same    */
/* /v1/exit an agent would call, with the same 402, from the same browser.  */
/* Nothing is mocked, which is the point: a demo of a payment flow that     */
/* does not take payment teaches the visitor nothing.                       */
/* ---------------------------------------------------------------------- */

type Challenge = {
  accepts?: {
    payTo?: string | null;
    maxAmountRequired?: string;
    asset?: string;
    assetSymbol?: string;
    network?: string;
    description?: string;
  }[];
  rejected?: string;
  howToPay?: string[];
};

function challengeLines(body: Challenge, symbol: string, size: number): Line[] {
  const terms = body.accepts?.[0];
  const price = terms?.maxAmountRequired ? Number(terms.maxAmountRequired) / 1e6 : null;
  const lines: Line[] = [];

  if (body.rejected) {
    lines.push({ text: `payment rejected — ${body.rejected}`, tone: "ember" }, { text: "" });
  }

  lines.push({ text: "402 PAYMENT REQUIRED", tone: "amber" }, { text: "" });

  if (!terms?.payTo) {
    lines.push(
      { text: "this endpoint is not accepting payment yet.", tone: "ember" },
      { text: "the receiving address is unset, so it refuses rather than", tone: "dim" },
      { text: "inventing one. nothing you send would arrive.", tone: "dim" },
    );
    return lines;
  }

  lines.push(
    { text: `price           ${(price !== null ? `${price} ${terms.assetSymbol ?? "USDG"}` : "—").padStart(14)}`, tone: "ink" },
    { text: `network         ${(terms.network ?? "eip155:4663").padStart(14)}`, tone: "ink" },
    { text: `asset           ${terms.asset ?? ""}`, tone: "ink", copy: terms.asset },
    { text: `pay to          ${terms.payTo}`, tone: "amber", copy: terms.payTo },
    { text: "" },
    { text: "send it from your own wallet, on Robinhood Chain, then:", tone: "dim" },
    { text: "  hatch/pay <transaction hash>", tone: "ink" },
    { text: "" },
    { text: "how we confirm: your wallet signs the hash (one click, moves nothing),", tone: "dim" },
    { text: "and we pull the transaction off the chain ourselves — it must carry", tone: "dim" },
    { text: "≥ 1 USDG to the address above, from the wallet that signed. the chain is", tone: "dim" },
    { text: "the receipt; the signature proves the receipt is yours. no login, no account.", tone: "dim" },
    { text: "" },
    { text: `you asked: ${symbol} ${usd(size)} — it will run by itself once paid.`, tone: "dim" },
  );
  return lines;
}

type LiveAnswer = {
  symbol: string;
  loanAsset?: string;
  askedUsd: number;
  quotedAtBlock: string;
  clears: boolean;
  maxExitUsd: number;
  wouldReceiveUsd: number | null;
  shortfallUsd: number;
  costPct: number | null;
  mechanismNote?: string;
  snapshotForComparison?: { maxExitUsd?: number; poolBlock?: string };
  pass?: { expiresAt?: string };
};

function answerLines(body: LiveAnswer): Line[] {
  const head = body.clears
    ? { text: `YES — ${usd(body.askedUsd)} of ${body.symbol} can exit into ${body.loanAsset ?? "USDG"} right now.`, tone: "ink" as Tone }
    : { text: `NO — ${usd(body.askedUsd)} of ${body.symbol} cannot exit into ${body.loanAsset ?? "USDG"} right now.`, tone: "ember" as Tone };

  const lines: Line[] = [
    { text: `LIVE · block ${body.quotedAtBlock}`, tone: "amber" },
    { text: "" },
    head,
    { text: "" },
    { text: `max exit        ${usd(body.maxExitUsd).padStart(14)}`, tone: "ink" },
    { text: `you asked for   ${usd(body.askedUsd).padStart(14)}`, tone: "ink" },
  ];

  if (!body.clears) {
    lines.push({ text: `short by        ${usd(body.shortfallUsd).padStart(14)}`, tone: "ember" });
  }
  if (body.wouldReceiveUsd !== null) {
    lines.push({ text: `you'd receive   ${usd(body.wouldReceiveUsd).padStart(14)}`, tone: "ink" });
  }
  if (body.costPct !== null) {
    lines.push({ text: `costs you       ${(body.costPct.toFixed(2) + "%").padStart(14)}`, tone: "dim" });
  }

  // The reason this question is worth a dollar. If the two agree, that shows
  // too — a day-old number being right is also worth knowing.
  const snap = body.snapshotForComparison?.maxExitUsd;
  if (typeof snap === "number" && snap > 0) {
    const drift = body.maxExitUsd - snap;
    const pct = (drift / snap) * 100;
    lines.push(
      { text: "" },
      { text: `snapshot said   ${usd(snap).padStart(14)}   block ${body.snapshotForComparison?.poolBlock ?? "?"}`, tone: "dim" },
      {
        text: `moved since     ${signed(drift).padStart(14)}   ${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`,
        tone: Math.abs(pct) >= 1 ? "ember" : "dim",
      },
    );
  }

  lines.push({ text: "" });
  if (body.pass?.expiresAt) {
    lines.push({ text: `pass good until ${body.pass.expiresAt.slice(0, 10)}.`, tone: "dim" });
  }
  lines.push({
    text: "quoted, not settled. a quote and an executed swap can disagree where hooks are involved.",
    tone: "dim",
  });
  return lines;
}

async function askLive(session: Session, symbol: string, size: number): Promise<Line[]> {
  const headers: Record<string, string> = {};
  if (session.pass) headers["x-payment"] = session.pass;

  let response: Response;
  try {
    response = await fetch(
      `/v1/exit?symbol=${encodeURIComponent(symbol)}&size=${size}`,
      { headers, cache: "no-store" },
    );
  } catch {
    return [
      { text: "could not reach the endpoint.", tone: "ember" },
      { text: "the free commands still work — they read a file, not the network.", tone: "dim" },
    ];
  }

  const body = await response.json().catch(() => null);
  if (!body) {
    return [{ text: `endpoint returned ${response.status} with no body`, tone: "ember" }];
  }

  if (response.status === 402) {
    // Keep the question so `hatch/pay` can finish it, and drop a pass the
    // server just refused rather than replaying it on every command.
    session.pending = { symbol, size };
    if (body.rejected && session.pass) forgetPass(session);
    return challengeLines(body as Challenge, symbol, size);
  }

  if (response.status === 503) {
    return [
      { text: "the chain did not answer.", tone: "ember" },
      { text: body.detail ?? "", tone: "dim" },
      { text: "no answer is better than a stale one presented as live.", tone: "dim" },
      { text: "your pass is untouched. try again in a moment.", tone: "dim" },
    ];
  }

  if (!response.ok) {
    return [
      { text: body.error ?? `endpoint returned ${response.status}`, tone: "ember" },
      ...(body.known ? [{ text: `known: ${body.known.join(", ")}`, tone: "dim" as Tone }] : []),
    ];
  }

  if (body.measured === false) {
    return [
      { text: `${body.symbol} has exposure but no probe yet.`, tone: "dim" },
      { text: "it is never counted as covered.", tone: "dim" },
    ];
  }

  session.pending = null;
  if (body.pass?.expiresAt) session.expiresAt = body.pass.expiresAt;
  return answerLines(body as LiveAnswer);
}

function rememberPass(session: Session, hash: string) {
  session.pass = hash;
  try {
    localStorage.setItem(PASS_KEY, hash);
  } catch {
    // Private browsing. The pass still works for this page view.
  }
}

function forgetPass(session: Session) {
  session.pass = null;
  session.expiresAt = null;
  try {
    localStorage.removeItem(PASS_KEY);
  } catch {
    /* nothing to clean up */
  }
}

/** A wallet extension, if one is installed. Only personal_sign is ever asked
 *  of it — nothing here can move funds. */
declare global {
  interface Window {
    ethereum?: { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };
  }
}

function signManually(hash: string): Line[] {
  return [
    { text: "no wallet extension found in this browser.", tone: "dim" },
    { text: "sign from any terminal instead — the key never leaves your machine:", tone: "dim" },
    { text: "" },
    {
      text: `cast wallet sign "hatch-pass:${hash.toLowerCase()}" --interactive`,
      tone: "ink",
      copy: `cast wallet sign "hatch-pass:${hash.toLowerCase()}" --interactive`,
    },
    { text: "" },
    { text: "then:  hatch/pay <hash> <signature>", tone: "ink" },
  ];
}

async function pay(session: Session, hash: string, givenSig?: string): Promise<Line[]> {
  if (!/^0x[0-9a-fA-F]{64}$/.test(hash)) {
    return [
      { text: "that is not a transaction hash.", tone: "ember" },
      { text: "expected 0x followed by 64 hex characters.", tone: "dim" },
    ];
  }

  // The signature proves the hash is the caller's own payment and not one
  // photocopied off the explorer — every transfer to the receiving address is
  // public, so the hash alone could never be the whole credential.
  let signature = givenSig ?? null;
  if (signature && !/^0x[0-9a-fA-F]{130}$/.test(signature)) {
    return [{ text: "that signature does not parse (expected 0x + 130 hex).", tone: "ember" }];
  }
  if (!signature) {
    if (!window.ethereum) return signManually(hash);
    try {
      const accounts = (await window.ethereum.request({
        method: "eth_requestAccounts",
      })) as string[];
      signature = (await window.ethereum.request({
        method: "personal_sign",
        params: [`hatch-pass:${hash.toLowerCase()}`, accounts[0]],
      })) as string;
    } catch {
      return [
        { text: "the wallet declined to sign.", tone: "ember" },
        { text: "signing costs nothing and moves nothing — it only proves the", tone: "dim" },
        { text: "payment is yours. run hatch/pay again to retry, or:", tone: "dim" },
        ...signManually(hash).slice(2),
      ];
    }
  }

  rememberPass(session, `${hash}.${signature}`);
  const query = session.pending ?? { symbol: "USDe", size: 1_000_000 };
  return [
    { text: "signed. pass stored in this browser. verifying it on chain…", tone: "dim" },
    { text: "" },
    ...(await askLive(session, query.symbol, query.size)),
  ];
}

function passStatus(session: Session): Line[] {
  if (!session.pass) {
    return [
      { text: "no pass in this browser.", tone: "dim" },
      { text: "run  hatch/live USDe 1000000  to see what one costs.", tone: "dim" },
    ];
  }
  const [hash] = session.pass.split(".");
  return [
    { text: `payment         ${hash}`, tone: "ink", copy: session.pass },
    {
      text: `expires         ${(session.expiresAt ? session.expiresAt.slice(0, 10) : "unverified").padStart(14)}`,
      tone: "dim",
    },
    { text: "" },
    { text: "the pass is your payment's hash plus your signature over it, held only", tone: "dim" },
    { text: "in this browser. we store nothing about you. hatch/forget drops it.", tone: "dim" },
  ];
}

function run(input: string, session: Session): Line[] | Promise<Line[]> {
  const [command, ...args] = input.trim().split(/\s+/);
  switch (command) {
    case "":
      return [];
    case "help":
      return HELP;
    case "hatch/out":
      return chainWide();
    case "hatch/market":
      return args[0] ? marketDetail(args[0]) : [{ text: "usage: hatch/market <SYMBOL>", tone: "dim" }];
    case "hatch/exit": {
      if (!args[0] || !args[1]) return [{ text: "usage: hatch/exit <SYMBOL> <USD>", tone: "dim" }];
      const { symbol, sizeRaw } = symbolAndSize(args[0], args[1]);
      return exitAnswer(symbol, sizeRaw);
    }
    case "hatch/proof":
      return args[0] ? proof(args[0]) : [{ text: "usage: hatch/proof <SYMBOL>", tone: "dim" }];
    case "hatch/live": {
      if (!args[0] || !args[1]) return [{ text: "usage: hatch/live <SYMBOL> <USD>", tone: "dim" }];
      const { symbol, sizeRaw } = symbolAndSize(args[0], args[1]);
      const size = parseSize(sizeRaw);
      if (size === null) {
        return [{ text: `"${sizeRaw}" is not a size. try: hatch/live USDe 1000000`, tone: "ember" }];
      }
      const market = findMarket(symbol);
      if (!market) return unknownSymbol(symbol);
      // Canonical casing from here on, so "usde" asks and answers as USDe.
      return askLive(session, market.symbol, size);
    }
    case "hatch/pay":
      return args[0]
        ? pay(session, args[0], args[1])
        : [{ text: "usage: hatch/pay <TX HASH>  (or: hatch/pay <TX HASH> <SIGNATURE>)", tone: "dim" }];
    case "hatch/pass":
      return passStatus(session);
    case "hatch/forget":
      forgetPass(session);
      return [{ text: "pass dropped from this browser.", tone: "dim" }];
    default:
      return [
        { text: `unknown command: ${command}`, tone: "ember" },
        { text: "type help", tone: "dim" },
      ];
  }
}

type Entry = { id: number; input: string; output: Line[]; busy?: boolean };

export default function Console() {
  const [history, setHistory] = useState<Entry[]>([]);
  const [typed, setTyped] = useState("");
  const [entry, setEntry] = useState("");
  const [booted, setBooted] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);
  const recall = useRef<string[]>([]);
  const recallAt = useRef(-1);
  const session = useRef<Session>({ pass: null, expiresAt: null, pending: null });

  // Page-load sequence: the console runs the product rather than describing it.
  useEffect(() => {
    try {
      session.current.pass = localStorage.getItem(PASS_KEY);
    } catch {
      /* storage unavailable; the console works without it */
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const boot = () => {
      setHistory([{ id: nextId.current++, input: BOOT_COMMAND, output: chainWide() }]);
      setBooted(true);
    };
    if (reduced) {
      setTyped(BOOT_COMMAND);
      boot();
      return;
    }
    let index = 0;
    let settle: ReturnType<typeof setTimeout>;
    const typing = setInterval(() => {
      index += 1;
      setTyped(BOOT_COMMAND.slice(0, index));
      if (index >= BOOT_COMMAND.length) {
        clearInterval(typing);
        settle = setTimeout(boot, 260);
      }
    }, 62);
    return () => {
      clearInterval(typing);
      clearTimeout(settle);
    };
  }, []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [history]);

  const commit = useCallback(() => {
    const input = entry;
    setEntry("");
    if (input.trim()) {
      recall.current = [...recall.current, input].slice(-40);
      recallAt.current = -1;
    }
    if (input.trim() === "clear") {
      setHistory([]);
      return;
    }

    const outcome = run(input, session.current);
    if (Array.isArray(outcome)) {
      setHistory((prev) => [...prev, { id: nextId.current++, input, output: outcome }]);
      return;
    }

    // A network command holds the line open. Without this the console looks
    // broken for the second or two the chain takes to answer.
    const id = nextId.current++;
    setHistory((prev) => [
      ...prev,
      { id, input, output: [{ text: "working…", tone: "dim" }], busy: true },
    ]);
    outcome
      .catch((error: unknown) => [
        { text: "the command failed.", tone: "ember" as Tone },
        { text: error instanceof Error ? error.message.slice(0, 160) : "unknown", tone: "dim" as Tone },
      ])
      .then((output) => {
        setHistory((prev) =>
          prev.map((item) => (item.id === id ? { ...item, output, busy: false } : item)),
        );
      });
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
        return;
      }
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      const log = recall.current;
      if (log.length === 0) return;
      event.preventDefault();
      const at =
        event.key === "ArrowUp"
          ? Math.min(recallAt.current + 1, log.length - 1)
          : recallAt.current - 1;
      recallAt.current = at;
      setEntry(at < 0 ? "" : log[log.length - 1 - at]);
    },
    [commit],
  );

  const copy = useCallback((value: string) => {
    navigator.clipboard?.writeText(value).then(
      () => {
        setCopied(value);
        setTimeout(() => setCopied((current) => (current === value ? null : current)), 1400);
      },
      () => setCopied(null),
    );
  }, []);

  return (
    <div className={styles.console} onClick={() => inputRef.current?.focus()}>
      <div className={styles.chrome}>
        <span className={styles.label}>HATCH CONSOLE</span>
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

        {history.map((item) => (
          <div key={item.id}>
            <div className={styles.row}>
              <span className={styles.prompt}>{PROMPT}</span>
              <span className={styles.cmd}>{item.input}</span>
            </div>
            {item.output.map((line, j) => {
              const className = `${styles.out} ${line.tone ? styles[line.tone] : ""} ${
                item.busy ? styles.pending : ""
              }`;
              if (!line.copy) {
                return (
                  <div
                    key={j}
                    className={className}
                    style={{ animationDelay: `${Math.min(j * 34, 500)}ms` }}
                  >
                    {line.text || " "}
                  </div>
                );
              }
              const value = line.copy;
              return (
                <div
                  key={j}
                  className={className}
                  style={{ animationDelay: `${Math.min(j * 34, 500)}ms` }}
                >
                  <button
                    type="button"
                    className={styles.copy}
                    onClick={(event) => {
                      event.stopPropagation();
                      copy(value);
                    }}
                    title="Copy"
                  >
                    {line.text}
                  </button>
                  {copied === value && <span className={styles.copied}> copied</span>}
                </div>
              );
            })}
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
              placeholder="hatch/live USDe 1000000"
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
