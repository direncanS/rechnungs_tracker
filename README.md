# RechnungTracker

Supplier invoice management system with automated PDF parsing, review workflow, and CSV export.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 15 (App Router), React 19, Tailwind CSS |
| Backend | Next.js API Routes, NextAuth.js (JWT) |
| Database | PostgreSQL 16, Prisma ORM |
| Queue | BullMQ, Redis 7 |
| Parser | Python 3.11, FastAPI, pdfplumber, Tesseract OCR |
| Testing | Vitest, React Testing Library, pytest |
| Infrastructure | Docker Compose (5 services) |

## Features

- **PDF Upload** -- drag-and-drop with duplicate detection (SHA-256)
- **Automated Parsing** -- text extraction via pdfplumber with Tesseract OCR fallback
- **Confidence Scoring** -- parser reports extraction confidence per field
- **Two-Field Status Model** -- separate processing status and review status tracking
- **Review Workflow** -- accountants can edit, approve, or reject parsed invoices
- **Supplier Management** -- auto-created from parsed data, reassignable during review
- **Role-Based Access** -- Worker, Accountant, Owner with hierarchical permissions
- **Admin Panel** -- user management (create, update, activate/deactivate)
- **CSV Export** -- filtered invoice data export for Owner role
- **Audit Trail** -- every review action recorded with reviewer, timestamp, and changes

## Architecture

```
                          +-------------------+
                          |     Browser       |
                          +--------+----------+
                                   |
                          +--------v----------+
                          |   Next.js Web     |
                          |   (API + UI)      |
                          +---+----------+----+
                              |          |
                    +---------v--+   +---v---------+
                    | PostgreSQL |   |    Redis     |
                    |   (data)   |   |   (queue)    |
                    +-----^------+   +---+----------+
                          |              |
                          |    +---------v----------+
                          |    |   BullMQ Worker    |
                          |    +--------+-----------+
                          |             |
                          |    +--------v----------+
                          +----+  FastAPI Parser   |
                               |  (pdfplumber+OCR) |
                               +-------------------+
```

1. User uploads a PDF through the web UI
2. Web service saves the file, creates an invoice record, and enqueues a parse job
3. Worker picks up the job, sends the PDF to the parser service
4. Parser extracts text (pdfplumber, falls back to Tesseract OCR), returns structured data
5. Worker persists parsed data and updates the invoice status
6. Accountant reviews, edits if needed, then approves or rejects

## Getting Started

### Prerequisites

- Docker >= 24.0
- Docker Compose >= 2.20

### Setup

```bash
git clone https://github.com/direncanS/rechnungs_tracker.git
cd rechnungs_tracker
cp .env.example .env
```

Edit `.env` and set strong passwords:

```bash
# Generate secrets:
openssl rand -base64 32   # for NEXTAUTH_SECRET
openssl rand -base64 16   # for SEED_ADMIN_PASSWORD and POSTGRES_PASSWORD
```

### Start

```bash
docker compose up --build
```

This starts 5 services: PostgreSQL, Redis, Web (Next.js), Worker (BullMQ), Parser (FastAPI).

On first run, the entrypoint automatically runs Prisma migrations and seeds the admin account.

### Access

- **Web UI**: http://localhost:3000
- **Parser Health**: http://localhost:8000/health

Login with the admin credentials from your `.env` file.

## API Overview

| Method | Path | Role | Purpose |
|--------|------|------|---------|
| `*` | `/api/auth/[...nextauth]` | Public | Authentication (login/session) |
| `POST` | `/api/invoices/upload` | Worker+ | Upload PDF invoice |
| `GET` | `/api/invoices` | Worker+ | List invoices (filtered, paginated) |
| `GET` | `/api/invoices/:id` | Worker+ | Invoice detail with items |
| `GET` | `/api/invoices/:id/pdf` | Worker+ | Serve original PDF file |
| `GET` | `/api/invoices/:id/status` | Worker+ | Poll processing status |
| `POST` | `/api/invoices/:id/review` | Accountant+ | Submit review action |
| `PATCH` | `/api/invoices/:id/supplier` | Accountant+ | Reassign supplier |
| `GET` | `/api/suppliers` | Accountant+ | List suppliers |
| `GET` | `/api/admin/users` | Owner | List all users |
| `POST` | `/api/admin/users` | Owner | Create user |
| `PATCH` | `/api/admin/users/:id` | Owner | Update user |
| `GET` | `/api/export/invoices/csv` | Owner | Export invoices as CSV |

Role hierarchy: Worker < Accountant < Owner

## Testing

168+ tests across the full stack:

```bash
# Web + API tests (Vitest)
cd apps/web && pnpm test

# Parser tests (pytest)
cd apps/parser && python -m pytest
```

| Suite | Tests | Coverage |
|-------|-------|----------|
| API routes | 80+ | Auth, upload, list, detail, PDF, review, supplier, admin, export |
| Components | 40+ | Login, sidebar, dashboard, upload, list, detail, review, supplier |
| Worker | 32 | Job processing pipeline, error handling, retries |
| Parser | 52 | Text extraction, OCR fallback, regex parsing, confidence scoring |

## Project Structure

```
rechnungs_tracker/
├── apps/
│   ├── web/                          # Next.js 15 application
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # Database schema (5 models)
│   │   │   ├── migrations/           # PostgreSQL migrations
│   │   │   └── seed.ts               # Admin account seeder
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (auth)/login/     # Login page
│   │   │   │   ├── (dashboard)/      # Dashboard, invoices, upload, suppliers, admin, export
│   │   │   │   └── api/              # 14 API route handlers
│   │   │   ├── components/           # React components (sidebar, forms, status badges, etc.)
│   │   │   ├── hooks/                # Custom hooks (polling)
│   │   │   ├── lib/                  # Auth, queue, file storage, CSV export, constants
│   │   │   ├── types/                # TypeScript declarations
│   │   │   ├── worker/               # BullMQ job processor
│   │   │   └── middleware.ts         # Auth middleware
│   │   └── tests/
│   │       ├── api/                  # API route tests
│   │       ├── components/           # Component tests
│   │       └── worker/               # Worker tests
│   └── parser/                       # FastAPI parser service
│       ├── app/
│       │   ├── routers/              # Health + parse endpoints
│       │   ├── schemas/              # Request/response models
│       │   └── services/             # Text extraction, OCR, confidence scoring
│       └── tests/                    # Parser unit tests
├── docs/                             # Architecture documentation
│   ├── API.md                        # Endpoint reference
│   ├── DECISIONS.md                  # Architecture decision records
│   ├── DEPLOYMENT.md                 # Deployment guide
│   ├── DOMAIN.md                     # Domain glossary and business rules
│   └── TESTING.md                    # Testing strategy
├── storage/uploads/                  # Shared PDF upload volume
├── docker-compose.yml                # 5-service orchestration
├── .env.example                      # Environment variable template
└── README.md
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `POSTGRES_USER` | PostgreSQL username | `rechnungtracker` |
| `POSTGRES_PASSWORD` | PostgreSQL password | -- |
| `POSTGRES_DB` | PostgreSQL database name | `rechnungtracker` |
| `DATABASE_URL` | Full PostgreSQL connection string | -- |
| `REDIS_URL` | Redis connection string | `redis://redis:6379` |
| `NEXTAUTH_SECRET` | JWT signing secret | -- |
| `NEXTAUTH_URL` | Application base URL | `http://localhost:3000` |
| `SEED_ADMIN_EMAIL` | Initial admin email | `admin@rechnungtracker.local` |
| `SEED_ADMIN_PASSWORD` | Initial admin password | -- |
| `SEED_ADMIN_NAME` | Initial admin display name | `Admin` |
| `PARSER_URL` | Parser service URL | `http://parser:8000` |
| `UPLOAD_DIR` | Upload directory path (container) | `/app/storage/uploads` |
| `MAX_FILE_SIZE_MB` | Max upload file size in MB | `20` |

## Common Operations

```bash
# View logs
docker compose logs -f              # All services
docker compose logs -f web           # Web only
docker compose logs -f worker        # Worker only
docker compose logs -f parser        # Parser only

# Stop services
docker compose down                  # Stop
docker compose down -v               # Stop and remove volumes (clean reset)

# Rebuild
docker compose up --build

# Database backup
docker compose exec db pg_dump -U rechnungtracker rechnungtracker > backup.sql

# Upload files backup
cp -r storage/uploads/ backup-uploads/
```

## License

MIT
