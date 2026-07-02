# syntax=docker/dockerfile:1
# ---------- Zensil ETL (Python pipelines) ----------
# Build context: the etl/ directory. Source is placed at /app/etl so the
# absolute imports (from etl.auth import ...) resolve when run from /app.
FROM python:3.12-slim
WORKDIR /app
ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1

# dependencies (kept in sync with pyproject.toml)
RUN pip install --no-cache-dir \
    "httpx>=0.27" "psycopg[binary]>=3.2" "pydantic-settings>=2.4" "tenacity>=9.0"

# source as the importable "etl" package
COPY . /app/etl

# pipelines without credentials are skipped; env comes from the container env
CMD ["python", "-m", "etl.run_all"]
