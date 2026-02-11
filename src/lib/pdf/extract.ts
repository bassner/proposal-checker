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

export async function extractPDFText(buffer: ArrayBuffer): Promise<PDFExtractionResult> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const pageCount = pdf.numPages;

  const pages: ExtractedPage[] = [];

  for (let i = 1; i <= pageCount; i++) {
    const { text } = await extractText(pdf, { mergePages: false });
    // extractText with mergePages:false returns per-page text as array
    if (Array.isArray(text)) {
      for (let j = 0; j < text.length; j++) {
        pages.push({ pageNumber: j + 1, text: text[j] });
      }
      break; // Already got all pages
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
