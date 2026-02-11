import { getDocumentProxy, renderPageAsImage, createIsomorphicCanvasFactory } from "unpdf";

export interface RenderedPage {
  pageNumber: number;
  /** Base64-encoded PNG image */
  imageBase64: string;
}

const canvasImport = () => import("@napi-rs/canvas");

export async function renderPDFPages(buffer: ArrayBuffer): Promise<RenderedPage[]> {
  // Pre-resolve the canvas factory so the PDF proxy is created with it.
  // This ensures pdfjs can use it internally for all page operations.
  const CanvasFactory = await createIsomorphicCanvasFactory(canvasImport);
  const pdf = await getDocumentProxy(new Uint8Array(buffer), { CanvasFactory });
  const pages: RenderedPage[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const result = await renderPageAsImage(pdf, i, {
        scale: 2, // 2x for readable text
        canvasImport,
      });

      const base64 = Buffer.from(result).toString("base64");
      pages.push({ pageNumber: i, imageBase64: base64 });
    } catch (err) {
      // Skip pages that fail to render — text extraction is still available
      console.warn(`Failed to render page ${i} as image, skipping:`, err instanceof Error ? err.message : err);
    }
  }

  return pages;
}
