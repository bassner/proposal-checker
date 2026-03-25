# Proposal Checker

AI-powered thesis proposal reviewer for computer science students. Upload a PDF proposal and get structured, actionable feedback based on specific academic guidelines — covering structure, writing quality, bibliography, figures, objectives, schedule, and AI transparency.

> **Note:** This is an MVP / proof-of-concept.

## How It Works

1. Upload a PDF thesis proposal
2. The system extracts text and renders page images
3. Seven independent LLM checks run in parallel, each evaluating a different aspect of the proposal
4. An eighth LLM call merges, deduplicates, and ranks all findings
5. Results stream back in real-time via SSE with live progress indicators

The seven check groups: **Structure & Completeness**, **Problem & Motivation & Objectives**, **Bibliography & Citations**, **Figures & Diagrams**, **Scientific Writing Quality**, **AI Transparency Statement**, **Schedule Quality**.

## Setup

### Prerequisites

- Node.js 22+
- An API key for at least one LLM provider (Azure OpenAI or Ollama-compatible endpoint)

### Install and Run

```bash
npm install
cp .env.example .env.local  # then fill in your API keys
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Environment Variables

Create a `.env.local` file with the provider(s) you want to use:

**Azure OpenAI:**
```
AZURE_OPENAI_API_KEY=your-key
AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT=gpt-5.2
```

**Ollama (OpenAI-compatible endpoint):**
```
OLLAMA_API_KEY=your-key
OLLAMA_BASE_URL=https://your-ollama-host/v1
OLLAMA_MODEL=gpt-oss:120b
```

**Optional limits:**
```
MAX_PDF_SIZE_MB=10
MAX_PDF_PAGES=20
```

At least one provider must be configured. The `/api/config` endpoint exposes which providers are available (based on which API keys are set) so the UI can show the correct options.

### Docker

```bash
docker compose -f docker/docker-compose.yml up --build
```

Reads env vars from `.env.local`. Requires Node 22 for `ArrayBuffer.transferToFixedLength` support.

## Tech Stack

- **Next.js 16** (App Router, standalone output) with React 19
- **LangChain** (`@langchain/openai`) for LLM interaction with streaming
- **unpdf** for PDF text extraction, **@napi-rs/canvas** for PDF page rendering
- **Zod** for structured output validation
- **Tailwind CSS v4** + **shadcn/ui** components
- **js-tiktoken** for client-side token counting
