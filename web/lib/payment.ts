/**
 * Payment verification for the x402 endpoint.
 *
 * There is no database and no hot wallet. A caller pays USDG to the receiving
 * address themselves and presents the transaction hash; the server reads that
 * transaction back off the chain and decides. The chain is the ledger, which
 * means anyone can audit who paid and when without asking us, and there is no
 * key here for anyone to steal.
 *
 * This is the HTTP 402 challenge/retry shape. It is not the gasless facilitator
 * flow — that needs an operator wallet funding gas, which is a service that can
 * quietly die. Swapping a facilitator in later changes only this file.
 */

const RPC = process.env.RHC_RPC || "https://rpc.mainnet.chain.robinhood.com";
const USDG = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

/** Where callers pay. Unset means the endpoint refuses rather than inventing
 *  an address — a wrong address here would take real money to nowhere. */
export const PAY_TO = process.env.LASTOUT_PAY_TO?.toLowerCase();

export const PRICE_USDG = Number(process.env.LASTOUT_PRICE_USDG ?? "1");
export const PASS_DAYS = Number(process.env.LASTOUT_PASS_DAYS ?? "30");

export type PaymentResult =
  | { ok: true; payer: string; paidUsdg: number; expiresAt: string }
  | { ok: false; reason: string };

async function rpc<T>(method: string, params: unknown[]): Promise<T | null> {
  try {
    const response = await fetch(RPC, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
      cache: "no-store",
    });
    const payload = await response.json();
    return (payload.result ?? null) as T | null;
  } catch {
    return null;
  }
}

/** A pass is a USDG transfer to PAY_TO, at least PRICE_USDG, within the window. */
export async function verifyPayment(txHash: string): Promise<PaymentResult> {
  if (!PAY_TO) return { ok: false, reason: "receiving address not configured" };
  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return { ok: false, reason: "X-PAYMENT must be a transaction hash" };
  }

  const receipt = await rpc<{
    status: string;
    logs: { address: string; topics: string[]; data: string }[];
    blockNumber: string;
  }>("eth_getTransactionReceipt", [txHash]);

  if (!receipt) return { ok: false, reason: "transaction not found on chain 4663" };
  if (receipt.status !== "0x1") return { ok: false, reason: "transaction reverted" };

  const paid = receipt.logs.find(
    (log) =>
      log.address.toLowerCase() === USDG.toLowerCase() &&
      log.topics[0] === TRANSFER_TOPIC &&
      "0x" + log.topics[2].slice(-40) === PAY_TO,
  );
  if (!paid) return { ok: false, reason: `no USDG transfer to ${PAY_TO} in this transaction` };

  const amount = Number(BigInt(paid.data)) / 1e6;
  if (amount < PRICE_USDG) {
    return { ok: false, reason: `paid ${amount} USDG, price is ${PRICE_USDG}` };
  }

  const block = await rpc<{ timestamp: string }>("eth_getBlockByNumber", [
    receipt.blockNumber,
    false,
  ]);
  if (!block) return { ok: false, reason: "could not read the block" };

  const paidAt = Number(BigInt(block.timestamp)) * 1000;
  const expiresAt = paidAt + PASS_DAYS * 86_400_000;
  if (Date.now() > expiresAt) {
    return { ok: false, reason: `pass expired ${new Date(expiresAt).toISOString()}` };
  }

  return {
    ok: true,
    payer: "0x" + paid.topics[1].slice(-40),
    paidUsdg: amount,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function challenge(resource: string) {
  return {
    x402Version: 1,
    error: "payment required",
    accepts: [
      {
        scheme: "exact",
        network: "eip155:4663",
        asset: USDG,
        assetSymbol: "USDG",
        maxAmountRequired: String(Math.round(PRICE_USDG * 1e6)),
        payTo: PAY_TO ?? null,
        resource,
        description: `${PASS_DAYS}-day pass to ${resource}`,
        mimeType: "application/json",
      },
    ],
    howToPay: PAY_TO
      ? [
          `Send ${PRICE_USDG} USDG to ${PAY_TO} on Robinhood Chain (4663).`,
          "Retry this request with header  X-PAYMENT: <your transaction hash>",
          `The pass lasts ${PASS_DAYS} days from the block your payment landed in.`,
          "No account, no API key. The transaction is the credential.",
        ]
      : ["This endpoint is not accepting payment yet."],
  };
}
