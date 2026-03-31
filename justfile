# moanete

# Start the Vite dev server
dev:
    bun run dev

# Production build
build:
    bun run build

# Lint + format check
check:
    bun run check

# TypeScript type check
typecheck:
    bun run typecheck

# Auto-fix lint/format
fix:
    bun run fix

# Run tests
test:
    bun run test

# Run all checks (lint, format, types, tests, build)
verify:
    bun run check && bun run typecheck && bun test && bun run build

# Start local Whisper STT server (CUDA by default, use device=cpu for no GPU)
whisper model="base" device="cuda":
    uv run scripts/whisper-server.py --model "{{model}}" --device "{{device}}"

# Start Ollama LLM server
ollama model="llama3.2":
    ollama serve & sleep 1 && ollama pull {{model}}

# Start MCP server (stdio + WebSocket bridge on :3001)
mcp:
    bun src/mcp/server.ts

# Start everything for local dev (whisper + vite)
up:
    just whisper & just dev
