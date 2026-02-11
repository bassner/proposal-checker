import { readFile } from "fs/promises";
import { join } from "path";

const cache = new Map<string, string>();

export async function loadGuideline(filename: string): Promise<string> {
  if (cache.has(filename)) {
    return cache.get(filename)!;
  }

  const filePath = join(process.cwd(), "public", "guidelines", filename);
  const content = await readFile(filePath, "utf-8");
  cache.set(filename, content);
  return content;
}

export async function loadAllGuidelines(): Promise<{
  proposal: string;
  scientificWriting: string;
  aiTransparency: string;
}> {
  const [proposal, scientificWriting, aiTransparency] = await Promise.all([
    loadGuideline("proposal.md"),
    loadGuideline("scientific-writing.md"),
    loadGuideline("ai-transparency.md"),
  ]);
  return { proposal, scientificWriting, aiTransparency };
}
