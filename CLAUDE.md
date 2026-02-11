# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

An AI-powered thesis proposal reviewer for a CS research group. Users upload a PDF proposal, it gets analyzed against specific academic guidelines via 7 parallel LLM checks, results are merged/deduplicated, and actionable feedback is streamed back in real-time via SSE.

## Commands

```bash
npm run dev      # Start dev server (localhost:3000)
npm run build    # Production build (standalone output)
npm run lint     # ESLint (eslint-config-next with core-web-vitals + typescript)
npm start        # Start production server
```

Docker (from repo root):
```bash
docker compose -f docker/docker-compose.yml up --build
```

There are no tests in this project.

## Environment Variables

Configured via `.env.local` (see `docker/docker-compose.yml` for docker). Key vars:
- `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT` — Azure OpenAI provider
- `OLLAMA_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_MODEL` — Ollama provider
- `MAX_PDF_SIZE_MB` (default: 10), `MAX_PDF_PAGES` (default: 20)

## Architecture

### Pipeline Flow (server-side)

`POST /api/review` receives a PDF + provider choice, then streams SSE events back:

1. **PDF extraction** (`src/lib/pdf/extract.ts`) — uses `unpdf` to extract per-page text with `=== PAGE N ===` markers
2. **PDF rendering** (`src/lib/pdf/render.ts`) — renders pages as PNG images via `@napi-rs/canvas` (used for the figures check group's visual inspection)
3. **7 parallel LLM checks** (`src/lib/llm/parallel-runner.ts` → `check-runner.ts`) — each check group runs independently with its own system prompt from `prompts.ts`. Uses `p-limit` for concurrency control (unlimited for Azure, 2 for Ollama)
4. **Merge step** (`src/lib/llm/merger.ts`) — an 8th LLM call deduplicates, consolidates, ranks findings, and produces final 10-25 feedback items with an overall assessment

### Check Groups

Defined in `src/types/review.ts` (CHECK_GROUPS): structure, problem-motivation-objectives, bibliography, figures, writing, ai-transparency, schedule. Each has a detailed prompt in `src/lib/llm/prompts.ts`.

### Structured Output Strategy (`src/lib/llm/structured-invoke.ts`)

Three-attempt strategy for getting valid JSON from LLMs:
1. Native `withStructuredOutput()` (skipped for Responses API and think-tag models)
2. Prompt-based JSON extraction with streaming
3. Retry with fix prompt on parse failure

All outputs validated against Zod schemas in `src/lib/llm/schemas.ts`.

### LLM Providers (`src/lib/llm/provider.ts`)

Two providers, both using `ChatOpenAI` from LangChain:
- **Azure**: Uses Responses API with reasoning (`effort: "high"`, `summary: "auto"`)
- **Ollama**: OpenAI-compatible endpoint with `<think>` tag-based reasoning

### Client-Side

- Single-page app in `src/app/page.tsx` (client component)
- `src/hooks/use-review.ts` — manages the full `ReviewState`, parses SSE stream, handles all event types
- `src/hooks/use-file-upload.ts` — file selection/drag-drop logic
- SSE events are throttled server-side (200ms per source) for token/thinking updates
- Provider selection persisted to localStorage

### Key Design Decisions

- `next.config.ts` uses `output: "standalone"` for Docker deployment and `serverExternalPackages: ["@napi-rs/canvas"]` for native binary support
- `unpdf` can detach ArrayBuffers — the pipeline copies the buffer before PDF rendering (`pdfBuffer.slice(0)`)
- Token counting uses `js-tiktoken` with `o200k_base` encoding
- UI components from shadcn/ui (`src/components/ui/`), styled with Tailwind CSS v4
- Path alias: `@/*` maps to `./src/*`
- Guidelines files in `public/guidelines/` (loaded server-side by `src/lib/guidelines/loader.ts`, currently not wired into the pipeline prompts)
