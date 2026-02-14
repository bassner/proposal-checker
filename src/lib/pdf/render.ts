import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface RenderedPage {
  pageNumber: number;
  /** Base64-encoded PNG image */
  imageBase64: string;
}

// TODO: Consider reducing DPI or capping rendered pages for large PDFs (P1-3)
export async function renderPDFPages(buffer: ArrayBuffer): Promise<RenderedPage[]> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "pdf-render-"));
  const inputPath = path.join(tmpDir, "input.pdf");
  const outputPrefix = path.join(tmpDir, "page");

  try {
    await fs.writeFile(inputPath, Buffer.from(buffer));

    await execFileAsync("pdftoppm", ["-png", "-r", "200", inputPath, outputPrefix]);

    // pdftoppm outputs files like page-01.png, page-02.png, ...
    const files = await fs.readdir(tmpDir);
    const pngFiles = files
      .filter((f) => f.startsWith("page-") && f.endsWith(".png"))
      .sort();

    const pages: RenderedPage[] = [];
    for (const file of pngFiles) {
      const pageNum = parseInt(file.replace("page-", "").replace(".png", ""), 10);
      const data = await fs.readFile(path.join(tmpDir, file));
      pages.push({ pageNumber: pageNum, imageBase64: data.toString("base64") });
    }

    return pages;
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
