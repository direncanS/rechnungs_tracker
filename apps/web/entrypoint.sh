#!/bin/sh
set -e

APP_BOOT_PHASE="${APP_BOOT_PHASE:-1}"
STANDALONE_DIR="/app/.next/standalone"

echo "=== RechnungTracker Web Entrypoint ==="
echo "APP_BOOT_PHASE=$APP_BOOT_PHASE"

# ─── Phase 0: Skip migration/seed (scaffold validation) ───
if [ "$APP_BOOT_PHASE" = "0" ]; then
  echo "Phase 0: Skipping migrations and seed"
  echo "Phase 0: Starting Next.js..."
  cd "$STANDALONE_DIR"
  exec node server.js
fi

# ─── Phase 1+: Run migrations and seed ───

# Check required environment variables
if [ -z "$NEXTAUTH_SECRET" ] || [ "$NEXTAUTH_SECRET" = "changeme-generate-with-openssl-rand-base64-32" ]; then
  echo "ERROR: NEXTAUTH_SECRET must be set to a strong random value"
  exit 1
fi

if [ -z "$SEED_ADMIN_PASSWORD" ] || [ "$SEED_ADMIN_PASSWORD" = "changeme-generate-with-openssl-rand-base64-16" ]; then
  echo "ERROR: SEED_ADMIN_PASSWORD must be set to a strong random value"
  exit 1
fi

# Wait for database to be ready
echo "Waiting for database..."
RETRIES=30
until pg_isready -h db -p 5432 -U "$POSTGRES_USER" 2>/dev/null || [ $RETRIES -eq 0 ]; do
  echo "Waiting for PostgreSQL... ($RETRIES retries left)"
  RETRIES=$((RETRIES - 1))
  sleep 2
done

if [ $RETRIES -eq 0 ]; then
  echo "ERROR: Database not available after 60 seconds"
  exit 1
fi

# Run Prisma migrations
echo "Running Prisma migrations..."
cd /app
if npx prisma migrate deploy 2>&1; then
  echo "Migrations completed successfully"
else
  echo "WARNING: Migration failed or no migrations found"
fi

# Run seed script (idempotent)
echo "Running seed script..."
if npx tsx prisma/seed.ts 2>&1; then
  echo "Seed completed successfully"
else
  echo "WARNING: Seed script failed or not available"
fi

# Create sentinel file to signal readiness
touch /tmp/.healthcheck-ready
echo "Sentinel file created — health check will return 200"

# Start Next.js
echo "Starting Next.js..."
cd "$STANDALONE_DIR"
exec node server.js
