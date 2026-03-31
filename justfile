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

# Run unit/integration tests
test:
    bun run test

# Run e2e tests (Chrome + Firefox)
test-e2e:
    bun run test:e2e

# Run all checks (lint, format, types, tests, build)
verify:
    bun run check && bun run typecheck && bun run test && bun run build

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

# Start with Docker (uses host Ollama if running, or add --profile ollama)
docker:
    docker compose up --build

# Start with Docker + bundled Ollama
docker-full:
    docker compose --profile ollama up --build

# Start with Docker (GPU — requires NVIDIA Container Toolkit)
docker-gpu:
    docker compose --profile ollama -f docker-compose.yml -f docker-compose.gpu.yml up --build

# Start Docker in background
docker-up:
    docker compose up --build -d

# Start Docker in background (with Ollama)
docker-full-up:
    docker compose --profile ollama up --build -d

# Start Docker in background (GPU)
docker-gpu-up:
    docker compose --profile ollama -f docker-compose.yml -f docker-compose.gpu.yml up --build -d

# Stop Docker
docker-down:
    docker compose --profile ollama down
    docker network prune -f

# Docker logs
docker-logs service="app":
    docker compose logs -f {{service}}

