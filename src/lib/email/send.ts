import "server-only";
import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import type { MergedFeedback, Severity } from "@/types/review";

// ---------------------------------------------------------------------------
// SMTP configuration (all optional — email is silently skipped when unconfigured)
// ---------------------------------------------------------------------------

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

function isConfigured(): boolean {
  return !!(SMTP_HOST && SMTP_FROM);
}

// Cache transport on globalThis to survive HMR (same pattern as DB pool)
const globalEmail = globalThis as unknown as {
  __smtpTransport?: Transporter | null;
  __smtpWarned?: boolean;
};

function getTransport(): Transporter | null {
  if (!isConfigured()) {
    if (!globalEmail.__smtpWarned) {
      globalEmail.__smtpWarned = true;
      console.warn("[email] SMTP_HOST is not set — email notifications are disabled.");
    }
    return null;
  }

  if (!globalEmail.__smtpTransport) {
    globalEmail.__smtpTransport = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      ...(SMTP_USER && SMTP_PASS ? { auth: { user: SMTP_USER, pass: SMTP_PASS } } : {}),
    });
  }

  return globalEmail.__smtpTransport;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBaseUrl(): string | null {
  const url = process.env.AUTH_URL || process.env.APP_URL;
  if (!url) return null;
  try {
    const parsed = new URL(url);
    return parsed.origin; // normalized, no trailing slash
  } catch {
    return null;
  }
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sanitizeSubject(str: string): string {
  return str.replace(/[\r\n]/g, " ").trim();
}

function isValidEmail(email: string): boolean {
  return typeof email === "string" && email.length > 0 && email.includes("@") && email.length < 254;
}

const ASSESSMENT_LABELS: Record<MergedFeedback["overallAssessment"], string> = {
  "good": "Good",
  "acceptable": "Acceptable",
  "needs-work": "Needs Work",
};

const SEVERITY_ORDER: Severity[] = ["critical", "major", "minor", "suggestion"];

// ---------------------------------------------------------------------------
// Success email
// ---------------------------------------------------------------------------

export interface ReviewCompleteEmailParams {
  to: string;
  userName: string;
  fileName: string | null;
  reviewId: string;
  feedback: MergedFeedback;
}

export async function sendReviewCompleteEmail(params: ReviewCompleteEmailParams): Promise<void> {
  const transport = getTransport();
  if (!transport) return;
  if (!isValidEmail(params.to)) {
    console.debug("[email] Skipping notification — invalid recipient:", params.to.slice(0, 3) + "***");
    return;
  }

  const baseUrl = getBaseUrl();
  if (!baseUrl) {
    console.warn("[email] Skipping notification — AUTH_URL/APP_URL not configured for link generation.");
    return;
  }

  const { feedback, fileName, reviewId, userName } = params;
  const assessmentLabel = ASSESSMENT_LABELS[feedback.overallAssessment] ?? feedback.overallAssessment;
  const reviewUrl = `${baseUrl}/review/${reviewId}`;
  const safeFileName = escapeHtml(fileName ?? "Untitled");
  const safeName = escapeHtml(userName || "there");

  // Count findings by severity
  const counts: Record<string, number> = {};
  for (const f of feedback.findings) {
    counts[f.severity] = (counts[f.severity] || 0) + 1;
  }

  const countLines = SEVERITY_ORDER
    .filter((s) => counts[s])
    .map((s) => `${counts[s]} ${s}`)
    .join(", ");

  const totalFindings = feedback.findings.length;
  const subject = sanitizeSubject(
    `Review complete: ${fileName ?? "your proposal"} — ${assessmentLabel}`
  );

  // Plain text version
  const text = [
    `Hi ${userName || "there"},`,
    "",
    `Your review of "${fileName ?? "your proposal"}" is complete.`,
    "",
    `Overall assessment: ${assessmentLabel}`,
    `Findings: ${totalFindings}${countLines ? ` (${countLines})` : ""}`,
    "",
    `View full results: ${reviewUrl}`,
    "",
    "— Proposal Checker",
  ].join("\n");

  // HTML version (minimal)
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="margin:0 0 16px">Review Complete</h2>
  <p>Hi ${safeName},</p>
  <p>Your review of <strong>${safeFileName}</strong> is complete.</p>
  <table style="border-collapse:collapse;margin:16px 0">
    <tr><td style="padding:4px 12px 4px 0;color:#666">Assessment</td><td style="padding:4px 0"><strong>${escapeHtml(assessmentLabel)}</strong></td></tr>
    <tr><td style="padding:4px 12px 4px 0;color:#666">Findings</td><td style="padding:4px 0">${totalFindings}${countLines ? ` (${escapeHtml(countLines)})` : ""}</td></tr>
  </table>
  <p><a href="${escapeHtml(reviewUrl)}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">View Results</a></p>
  <p style="color:#666;font-size:13px;margin-top:24px">— Proposal Checker</p>
</body></html>`;

  try {
    await transport.sendMail({
      from: SMTP_FROM,
      to: params.to,
      subject,
      text,
      html,
    });
    console.log(`[email] Review complete notification sent for ${reviewId}`);
  } catch (err) {
    console.error("[email] Failed to send review complete notification:", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Error email
// ---------------------------------------------------------------------------

export interface ReviewErrorEmailParams {
  to: string;
  userName: string;
  fileName: string | null;
  reviewId: string;
  error: string;
}

export async function sendReviewErrorEmail(params: ReviewErrorEmailParams): Promise<void> {
  const transport = getTransport();
  if (!transport) return;
  if (!isValidEmail(params.to)) return;

  const baseUrl = getBaseUrl();
  if (!baseUrl) return;

  const { fileName, reviewId, userName } = params;
  const homeUrl = `${baseUrl}/`;
  const safeFileName = escapeHtml(fileName ?? "Untitled");
  const safeName = escapeHtml(userName || "there");
  const safeError = escapeHtml(params.error);

  const subject = sanitizeSubject(
    `Review failed: ${fileName ?? "your proposal"}`
  );

  const text = [
    `Hi ${userName || "there"},`,
    "",
    `Unfortunately, the review of "${fileName ?? "your proposal"}" encountered an error:`,
    params.error,
    "",
    `You can start a new review at: ${homeUrl}`,
    "",
    "— Proposal Checker",
  ].join("\n");

  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="margin:0 0 16px">Review Failed</h2>
  <p>Hi ${safeName},</p>
  <p>Unfortunately, the review of <strong>${safeFileName}</strong> encountered an error:</p>
  <p style="padding:12px;background:#fef2f2;border-left:4px solid #ef4444;color:#991b1b;border-radius:4px">${safeError}</p>
  <p><a href="${escapeHtml(homeUrl)}" style="display:inline-block;padding:10px 20px;background:#2563eb;color:#fff;text-decoration:none;border-radius:6px">Start a New Review</a></p>
  <p style="color:#666;font-size:13px;margin-top:24px">— Proposal Checker</p>
</body></html>`;

  try {
    await transport.sendMail({
      from: SMTP_FROM,
      to: params.to,
      subject,
      text,
      html,
    });
    console.log(`[email] Review error notification sent for ${reviewId}`);
  } catch (err) {
    console.error("[email] Failed to send review error notification:", err instanceof Error ? err.message : err);
  }
}
