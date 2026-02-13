"use client";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

interface GuidelinesViewerProps {
  guidelines: {
    proposal: string;
    scientificWriting: string;
    aiTransparency: string;
  };
}

const tabs = [
  { value: "proposal", label: "Proposal Structure" },
  { value: "writing", label: "Scientific Writing" },
  { value: "ai", label: "AI Transparency" },
] as const;

export function GuidelinesViewer({ guidelines }: GuidelinesViewerProps) {
  return (
    <Tabs defaultValue="proposal" className="w-full">
      <TabsList className="mb-4 w-full border border-white/10 bg-white/5">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.value}
            value={tab.value}
            className="text-white/50 data-[state=active]:bg-blue-500/20 data-[state=active]:text-blue-300"
          >
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">
              {tab.value === "proposal"
                ? "Proposal"
                : tab.value === "writing"
                  ? "Writing"
                  : "AI"}
            </span>
          </TabsTrigger>
        ))}
      </TabsList>

      <TabsContent value="proposal">
        <MarkdownContent content={guidelines.proposal} />
      </TabsContent>
      <TabsContent value="writing">
        <MarkdownContent content={guidelines.scientificWriting} />
      </TabsContent>
      <TabsContent value="ai">
        <MarkdownContent content={guidelines.aiTransparency} />
      </TabsContent>
    </Tabs>
  );
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-xl sm:p-6">
      <div
        className="guidelines-prose text-sm leading-relaxed text-white/70"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
      />
    </div>
  );
}

/**
 * Minimal markdown-to-HTML renderer. Handles:
 * - Headings (# through ###)
 * - Bold (**text**)
 * - Italic (*text*)
 * - Unordered lists (* item)
 * - Ordered lists (1. item)
 * - Nested list items (indented with spaces)
 * - Links (both [text](url) and <url>)
 * - Code (`inline`)
 * - Paragraphs (blank-line separated)
 */
function renderMarkdown(md: string): string {
  const lines = md.split("\n");
  const html: string[] = [];
  let inList: "ul" | "ol" | null = null;
  let inNestedList: "ul" | "ol" | null = null;

  function closeLists() {
    if (inNestedList) {
      html.push(`</${inNestedList}>`);
      inNestedList = null;
    }
    if (inList) {
      html.push(`</${inList}>`);
      inList = null;
    }
  }

  function inlineFormat(text: string): string {
    // Links: [text](url)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 underline hover:text-blue-300">$1</a>');
    // Auto-links: <url>
    text = text.replace(/<(https?:\/\/[^>]+)>/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-400 underline hover:text-blue-300">$1</a>');
    // Bold: **text**
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong class="text-white/90 font-semibold">$1</strong>');
    // Italic: *text* (but not ** which is bold)
    text = text.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, "<em>$1</em>");
    // Inline code: `text`
    text = text.replace(/`([^`]+)`/g, '<code class="rounded bg-white/10 px-1.5 py-0.5 text-xs text-blue-300">$1</code>');
    return text;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimEnd();

    // Blank line
    if (trimmed === "") {
      closeLists();
      continue;
    }

    // Headings
    const headingMatch = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (headingMatch) {
      closeLists();
      const level = headingMatch[1].length;
      const text = inlineFormat(headingMatch[2]);
      if (level === 1) {
        html.push(`<h2 class="mt-6 mb-3 text-lg font-bold text-white first:mt-0">${text}</h2>`);
      } else if (level === 2) {
        html.push(`<h3 class="mt-5 mb-2 text-base font-semibold text-white/90">${text}</h3>`);
      } else {
        html.push(`<h4 class="mt-4 mb-2 text-sm font-semibold text-white/80">${text}</h4>`);
      }
      continue;
    }

    // Nested list items (indented with spaces/tabs, starting with * or number.)
    const nestedUnorderedMatch = trimmed.match(/^(\s{2,}|\t+)\*\s+\*?\s*(.+)/);
    const nestedOrderedMatch = trimmed.match(/^(\s{2,}|\t+)\d+\.\s+(.+)/);

    if (nestedUnorderedMatch || nestedOrderedMatch) {
      const content = nestedUnorderedMatch
        ? inlineFormat(nestedUnorderedMatch[2])
        : inlineFormat(nestedOrderedMatch![2]);
      const listType = nestedOrderedMatch ? "ol" : "ul";

      if (!inList) {
        inList = "ul";
        html.push("<ul>");
      }
      if (inNestedList !== listType) {
        if (inNestedList) html.push(`</${inNestedList}>`);
        inNestedList = listType;
        html.push(listType === "ol" ? '<ol class="ml-4 list-decimal">' : '<ul class="ml-4">');
      }
      html.push(`<li>${content}</li>`);
      continue;
    }

    // Top-level unordered list (* item)
    const ulMatch = trimmed.match(/^\*\s+\*?\s*(.+)/);
    if (ulMatch) {
      if (inNestedList) {
        html.push(`</${inNestedList}>`);
        inNestedList = null;
      }
      if (inList !== "ul") {
        if (inList) html.push(`</${inList}>`);
        inList = "ul";
        html.push("<ul>");
      }
      html.push(`<li>${inlineFormat(ulMatch[1])}</li>`);
      continue;
    }

    // Top-level ordered list (1. item)
    const olMatch = trimmed.match(/^\d+\.\s+(.+)/);
    if (olMatch) {
      if (inNestedList) {
        html.push(`</${inNestedList}>`);
        inNestedList = null;
      }
      if (inList !== "ol") {
        if (inList) html.push(`</${inList}>`);
        inList = "ol";
        html.push('<ol class="list-decimal">');
      }
      html.push(`<li>${inlineFormat(olMatch[1])}</li>`);
      continue;
    }

    // Regular paragraph line
    closeLists();
    html.push(`<p class="mb-3 last:mb-0">${inlineFormat(trimmed)}</p>`);
  }

  closeLists();
  return html.join("\n");
}
