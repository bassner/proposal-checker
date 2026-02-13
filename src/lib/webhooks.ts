import "server-only";
import { createHmac } from "crypto";
import { getActiveWebhooksForEvent } from "@/lib/db";
import type { WebhookEvent } from "@/lib/db";

/**
 * Compute HMAC-SHA256 signature for a webhook payload.
 */
function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

/**
 * Fire-and-forget: dispatch a webhook event to all active subscribers.
 * Each webhook POST includes an X-Webhook-Signature header with the
 * HMAC-SHA256 hex digest of the JSON body.
 *
 * No retries — failures are logged and swallowed.
 */
export async function dispatchWebhookEvent(
  event: WebhookEvent,
  data: Record<string, unknown>
): Promise<void> {
  let webhooks;
  try {
    webhooks = await getActiveWebhooksForEvent(event);
  } catch (err) {
    console.error("[webhooks] Failed to fetch webhooks:", err);
    return;
  }

  if (webhooks.length === 0) return;

  const payload = JSON.stringify({ event, data, timestamp: new Date().toISOString() });

  const promises = webhooks.map(async (wh) => {
    const signature = signPayload(payload, wh.secret);
    try {
      const response = await fetch(wh.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Signature": signature,
        },
        body: payload,
        signal: AbortSignal.timeout(10_000), // 10s timeout per webhook
      });
      if (!response.ok) {
        console.warn(
          `[webhooks] ${event} -> ${wh.url} returned ${response.status}`
        );
      }
    } catch (err) {
      console.warn(
        `[webhooks] ${event} -> ${wh.url} failed:`,
        err instanceof Error ? err.message : err
      );
    }
  });

  // Fire-and-forget — don't block the caller
  Promise.allSettled(promises).catch(() => {});
}
