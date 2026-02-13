import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/helpers";
import { extractPDFText } from "@/lib/pdf/extract";
import { runPreflightChecks } from "@/lib/pdf/preflight";

/**
 * POST /api/preflight — Accepts a PDF file, extracts text, runs lightweight
 * structural checks, and returns warnings. Does NOT consume LLM tokens.
 *
 * Returns 200 with `{ warnings, pageCount }`.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
  } catch (response) {
    return response as Response;
  }

  const formData = await request.formData();
  const fileEntry = formData.get("file");
  const file = fileEntry instanceof File ? fileEntry : null;

  if (!file) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  if (file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Only PDF files are accepted" },
      { status: 400 }
    );
  }

  const maxSizeMB = parseInt(process.env.MAX_PDF_SIZE_MB || "10", 10);
  if (file.size > maxSizeMB * 1024 * 1024) {
    return NextResponse.json(
      { error: `File too large. Maximum size is ${maxSizeMB}MB.` },
      { status: 400 }
    );
  }

  try {
    const buffer = await file.arrayBuffer();
    // Slice to avoid detached buffer issues from unpdf
    const { fullText, pageCount } = await extractPDFText(buffer.slice(0));

    const warnings = runPreflightChecks(fullText, pageCount);

    return NextResponse.json({ warnings, pageCount });
  } catch (err) {
    console.error("[preflight] PDF extraction failed:", err);
    return NextResponse.json(
      { error: "Failed to analyze PDF. The file may be corrupted or password-protected." },
      { status: 422 }
    );
  }
}
