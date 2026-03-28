default:
    @just --list

# Install in development mode
dev:
    uv sync --all-extras

# Install offline-only (no anthropic)
install:
    uv sync

# Run the app
run *ARGS:
    uv run moanete {{ARGS}}

# Run setup wizard
setup:
    uv run moanete --setup

# List audio devices
devices:
    uv run moanete --list-devices

# Lint
lint:
    uv run ruff check src/
    uv run ruff format --check src/

# Format
fmt:
    uv run ruff check --fix src/
    uv run ruff format src/

# Type check
check:
    uv run ty check src/

# Type check + lint + format
quality:
    uv run ty check src/
    uv run ruff check src/
    uv run ruff format --check src/

# Lint + type check
ci: lint check
