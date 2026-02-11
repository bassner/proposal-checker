import { getDocumentProxy, extractText } from "unpdf";

export interface ExtractedPage {
  pageNumber: number;
  text: string;
}

export interface PDFExtractionResult {
  pages: ExtractedPage[];
  fullText: string;
  pageCount: number;
}

/**
 * Extract text content from a PDF buffer, returning per-page text and a
 * combined full-text string with `=== PAGE N ===` delimiters.
 *
 * Uses `unpdf` (pdfjs-based) for extraction. Falls back to a single merged
 * page if per-page extraction returns nothing (e.g., scanned PDFs with OCR layer).
 *
 * WARNING: `unpdf` may detach the passed ArrayBuffer. Callers should
 * `.slice(0)` the buffer first if they need it afterwards.
 */
export async function extractPDFText(buffer: ArrayBuffer): Promise<PDFExtractionResult> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const pageCount = pdf.numPages;

  const pages: ExtractedPage[] = [];

  const { text } = await extractText(pdf, { mergePages: false });
  if (Array.isArray(text)) {
    for (let j = 0; j < text.length; j++) {
      pages.push({ pageNumber: j + 1, text: text[j] });
    }
  }

  // Fallback: if we didn't get per-page, extract as single text
  if (pages.length === 0) {
    const { text } = await extractText(pdf, { mergePages: true });
    const fullText = Array.isArray(text) ? text.join("\n") : text;
    pages.push({ pageNumber: 1, text: fullText });
  }

  const fullText = pages.map((p) => `=== PAGE ${p.pageNumber} ===\n${p.text}`).join("\n\n");

  return { pages, fullText, pageCount };
}
