# RechnungTracker

Supplier invoice management system with automated PDF parsing.

## Setup

```bash
cp .env.example .env
docker compose up --build
```

## Services

- Web (Next.js 15): http://localhost:3000
- Parser (FastAPI): http://localhost:8000
- PostgreSQL 16, Redis 7
