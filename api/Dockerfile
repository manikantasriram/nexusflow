# The API as a container. Used by docker compose locally and by Render in production.
FROM python:3.14-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install dependencies first: this layer is cached until requirements.txt changes.
COPY requirements.txt .
RUN pip install -r requirements.txt

COPY . .

# Don't run as root inside the container.
RUN useradd --create-home appuser
USER appuser

ENV PORT=8000
EXPOSE 8000

# start.sh applies migrations (and seeds demo data when SEED_DEMO=true), then starts the server.
CMD ["sh", "start.sh"]
