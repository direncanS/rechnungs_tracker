# Deployment Guide

## Services

| Service | Image | Port | Role |
|---------|-------|------|------|
| `db` | postgres:16-alpine | 5432 (internal) | PostgreSQL database |
| `redis` | redis:7-alpine | 6379 (internal) | BullMQ queue backend |
| `web` | apps/web (custom) | 3000 | Next.js frontend + API |
| `worker` | apps/web (custom) | - | BullMQ job processor |
| `parser` | apps/parser (custom) | 8000 | FastAPI PDF parser |

## Startup Order

```
db, redis (parallel, no dependencies)
  → parser (no dependencies)
  → web (depends_on: db healthy, redis healthy)
    → worker (depends_on: web healthy)
```

## Volume Mounts

| Volume | Host Path | Container Path | Used By |
|--------|-----------|---------------|---------|
| `postgres_data` | Docker managed | `/var/lib/postgresql/data` | db |
| `uploads` | `./storage/uploads` | `/app/storage/uploads` | web, worker, parser |

## Healthcheck Mechanism

### Phase 0 (Scaffold Validation)

```bash
docker compose -f docker-compose.yml -f docker-compose.phase0.yml up --build
```

- `APP_BOOT_PHASE=0` set via `docker-compose.phase0.yml` override
- `entrypoint.sh` skips migrations and seed
- `/api/health` returns 200 without sentinel check
- Worker starts as idle queue listener

### Phase 1+ (Normal Operation)

```bash
docker compose up --build
```

- `APP_BOOT_PHASE` defaults to 1 (not set in docker-compose.yml)
- `entrypoint.sh` runs: migrations → seed → creates sentinel → starts Next.js
- `/api/health` checks for sentinel file (`/tmp/.healthcheck-ready`)
- Without sentinel: returns 503 (worker won't start)
- With sentinel: returns 200 (worker starts)

## Entrypoint Script (apps/web/entrypoint.sh)

Phase 1 sequence:
1. Validate required env vars (NEXTAUTH_SECRET, SEED_ADMIN_PASSWORD)
2. Wait for PostgreSQL (pg_isready loop, 30 retries, 2s interval)
3. Run `prisma migrate deploy`
4. Run `tsx prisma/seed.ts` (idempotent)
5. Create sentinel: `touch /tmp/.healthcheck-ready`
6. Start Next.js standalone server

## Common Operations

### View Logs
```bash
docker compose logs -f          # all services
docker compose logs -f web      # web only
docker compose logs -f worker   # worker only
docker compose logs -f parser   # parser only
```

### Restart Service
```bash
docker compose restart web
docker compose restart worker
```

### Clean Reset
```bash
docker compose down -v          # stop + remove volumes
docker compose up --build       # rebuild from scratch
```

### Backup
```bash
# Database
docker compose exec db pg_dump -U $POSTGRES_USER $POSTGRES_DB > backup.sql

# Restore
docker compose exec -T db psql -U $POSTGRES_USER $POSTGRES_DB < backup.sql

# Uploaded files
cp -r storage/uploads/ backup-uploads/
```

## Known Issues

- Worker shares Docker image with web (same build). Changes to web Dockerfile affect worker.
- `pg_isready` in entrypoint checks PostgreSQL is running, not that schema exists. Migrations handle schema.
- PDF storage grows over time (~2GB/day at 100 invoices/day). Monitor disk space.
