# Backend (FastAPI) image — built with uv
FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim

# uv settings: compile bytecode, copy (not symlink) packages into the venv
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    HOME=/home/kriy \
    PATH="/app/.venv/bin:$PATH"

WORKDIR /app

# Install dependencies first (cached unless lockfile changes).
# --no-install-project: this repo's app/ isn't a configured package, only deps are needed.
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project --no-dev

# Run the service without root privileges. Local storage directories remain
# writable for development; production deployments should use object storage.
RUN groupadd --system kriy \
    && useradd --system --gid kriy --home-dir /home/kriy --create-home --shell /usr/sbin/nologin kriy \
    && mkdir -p /app/temp /app/bucket \
    && chown -R kriy:kriy /app/temp /app/bucket

# Application code
COPY --chown=kriy:kriy app ./app

USER kriy

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD python -c "import os, urllib.request; urllib.request.urlopen('http://127.0.0.1:' + os.getenv('PORT', '8000') + '/health', timeout=3)" || exit 1

CMD ["sh", "-c", "exec uvicorn app.main:app --host \"${HOST:-0.0.0.0}\" --port \"${PORT:-8000}\""]
