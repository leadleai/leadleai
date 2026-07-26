# FastAPI backend image for Google Cloud Run.
#
# Cloud Run injects $PORT (usually 8080) and expects the app to listen on it —
# we never hardcode 8001. Scale-to-zero is fine because the schedulers no longer
# run in-process; Cloud Scheduler drives /api/cron/* instead (see DEPLOY_GCP.md).
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install deps first for better layer caching. requirements.txt is pruned to
# pure-Python wheels, so no system build toolchain is needed.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# App code.
COPY . .

# Run as a non-root user (Cloud Run doesn't require it, but it's good hygiene).
RUN useradd --create-home --uid 10001 appuser
USER appuser

# Cloud Run sets PORT; default to 8080 for local `docker run`.
ENV PORT=8080
EXPOSE 8080

# exec form via sh so ${PORT} is expanded at runtime.
CMD ["sh", "-c", "exec uvicorn server:app --host 0.0.0.0 --port ${PORT:-8080}"]
