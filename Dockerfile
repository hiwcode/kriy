# Backend (FastAPI) image — built with uv
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# uv settings: compile bytecode, copy (not symlink) packages into the venv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Install dependencies first (cached unless lockfile changes).
# --no-install-project: this repo's app/ isn't a configured package, only deps are needed.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# Application code
COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
