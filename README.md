# RechnungTracker

**Full-stack invoice management system** with automated PDF parsing, multi-stage review workflow, and role-based access control — built as a production-ready monorepo with Docker orchestration.

[![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688?logo=fastapi)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](https://www.python.org/)
[![Tests](https://img.shields.io/badge/tests-168%2B%20passing-brightgreen)](apps/web/tests)
[![Docker](https://img.shields.io/badge/Docker-5%20services-2496ED?logo=docker&logoColor=white)](docker-compose.yml)

---

## Overview

RechnungTracker automates the ingestion, parsing, and review of supplier invoices. Workers upload PDF invoices, a background pipeline extracts structured data using pdfplumber with Tesseract OCR fallback, and accountants review the results before approval. Owners manage users and export data.

**Key highlights:**
- End-to-end async pipeline: upload → queue → parse → review → export
- Dual-status tracking (processing + review) for clear audit trails
- Confidence scoring on extracted fields to guide reviewer attention
- SHA-256 duplicate detection prevents reprocessing
- 168+ automated tests across the full stack

---

## Tech Stack

| Layer | Technology |
|:------|:-----------|
| **Frontend** | Next.js 15 (App Router), React 19, Tailwind CSS |
| **Backend** | Next.js API Routes, NextAuth.js (JWT, httpOnly cookies) |
| **Database** | PostgreSQL 16, Prisma ORM (5 models, indexed queries) |
| **Queue** | BullMQ + Redis 7 (retry with backoff) |
| **Parser** | Python 3.11, FastAPI, pdfplumber, Tesseract OCR |
| **Testing** | Vitest + React Testing Library, pytest |
| **DevOps** | Docker Compose (5-service orchestration) |

---

## Architecture

```
┌─────────────┐
│   Browser    │
└──────┬──────┘
       │
┌──────▼──────┐       ┌──────────────┐
│  Next.js    │◄─────►│ PostgreSQL   │
│  Web + API  │       │   (data)     │
└──────┬──────┘       └──────▲───────┘
       │                     │
┌──────▼──────┐              │
│   Redis     │              │
│  (queue)    │              │
└──────┬──────┘              │
       │                     │
┌──────▼──────┐       ┌──────┴───────┐
│  BullMQ     │──────►│   FastAPI    │
│  Worker     │       │   Parser     │
└─────────────┘       │ (pdfplumber  │
                      │  + OCR)      │
                      └──────────────┘
```

**Pipeline flow:**

1. User uploads a PDF through the web interface
2. Server saves the file, creates an invoice record, enqueues a job to Redis
3. BullMQ worker picks up the job, sends the PDF to the parser service
4. Parser extracts text (pdfplumber first, Tesseract OCR fallback), returns structured data with confidence scores
5. Worker persists parsed data, line items, and supplier info to PostgreSQL
6. Accountant reviews the parsed data, edits if needed, then approves or rejects

---

## Features

### Invoice Processing
- **PDF Upload** — drag-and-drop with real-time progress, SHA-256 duplicate detection
- **Automated Parsing** — text extraction via pdfplumber, automatic Tesseract OCR fallback for scanned documents
- **Confidence Scoring** — per-field extraction confidence to guide reviewer attention
- **Status Polling** — live processing status updates via polling

### Review Workflow
- **Two-Field Status Model** — independent `processingStatus` and `reviewStatus` for precise tracking
- **Review Actions** — edit, approve, or reject with mandatory comments on rejection
- **Supplier Management** — auto-created from parsed data, reassignable during review
- **Audit Trail** — every review action recorded with reviewer, timestamp, and field-level changes

### Administration
- **Role-Based Access Control** — Worker, Accountant, Owner with hierarchical permissions
- **User Management** — create, update, activate/deactivate user accounts
- **CSV Export** — filtered invoice data export with date range and status filters

---

## Data Model

5 entities with relational integrity:

```
User ──┬── Invoice ──┬── InvoiceItem
       │             └── InvoiceReview
       │
       └── InvoiceReview

Supplier ── Invoice
```

| Entity | Purpose |
|:-------|:--------|
| **User** | System users with roles (Worker/Accountant/Owner) and active status |
| **Supplier** | Invoice sender companies, auto-created from parsed data |
| **Invoice** | Core record with file metadata, parsed fields, dual status tracking |
| **InvoiceItem** | Line items (description, quantity, unit price, tax rate) |
| **InvoiceReview** | Audit log for every review action with change tracking |

---

## API Endpoints

14 RESTful endpoints with role-based authorization:

| Method | Endpoint | Auth | Description |
|:-------|:---------|:-----|:------------|
| `*` | `/api/auth/[...nextauth]` | Public | Authentication (login/session) |
| `POST` | `/api/invoices/upload` | Worker+ | Upload PDF invoice |
| `GET` | `/api/invoices` | Worker+ | List invoices (paginated, filterable) |
| `GET` | `/api/invoices/:id` | Worker+ | Invoice detail with line items |
| `GET` | `/api/invoices/:id/pdf` | Worker+ | Serve original PDF file |
| `GET` | `/api/invoices/:id/status` | Worker+ | Poll processing status |
| `POST` | `/api/invoices/:id/review` | Accountant+ | Submit review (edit/approve/reject) |
| `PATCH` | `/api/invoices/:id/supplier` | Accountant+ | Reassign supplier |
| `GET` | `/api/suppliers` | Accountant+ | List all suppliers |
| `GET` | `/api/admin/users` | Owner | List all users |
| `POST` | `/api/admin/users` | Owner | Create new user |
| `PATCH` | `/api/admin/users/:id` | Owner | Update user details |
| `GET` | `/api/export/invoices/csv` | Owner | Export filtered invoices as CSV |

> **Role hierarchy:** Worker < Accountant < Owner. Higher roles inherit all lower-role permissions.

---

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

Generate secure values for `.env`:

```bash
openssl rand -base64 32   # → NEXTAUTH_SECRET
openssl rand -base64 16   # → SEED_ADMIN_PASSWORD, POSTGRES_PASSWORD
```

### Run

```bash
docker compose up --build
```

This starts all 5 services. On first run, the entrypoint automatically applies database migrations and seeds the admin account.

| Service | URL |
|:--------|:----|
| Web UI | http://localhost:3000 |
| Parser API | http://localhost:8000 |

Login with the admin credentials configured in `.env`.

---

## Testing

168+ tests across the full stack:

```bash
# Web + API tests (Vitest)
cd apps/web && pnpm test

# Parser tests (pytest)
cd apps/parser && python -m pytest
```

| Suite | Count | Scope |
|:------|------:|:------|
| API Routes | 80+ | Auth, upload, list, detail, PDF serving, review, supplier, admin, export |
| Components | 40+ | Login, sidebar, dashboard, upload, list, detail, review, supplier |
| Worker | 32 | Job processing pipeline, error handling, retries |
| Parser | 52 | Text extraction, OCR fallback, regex parsing, confidence scoring |

---

## Project Structure

```
rechnungs_tracker/
├── apps/
│   ├── web/                          # Next.js 15 application
│   │   ├── prisma/
│   │   │   ├── schema.prisma         # 5 models, 4 enums, indexed queries
│   │   │   ├── migrations/           # PostgreSQL migrations
│   │   │   └── seed.ts               # Admin account seeder
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── (auth)/           # Login page
│   │   │   │   ├── (dashboard)/      # Dashboard, invoices, upload,
│   │   │   │   │                     # suppliers, admin, export
│   │   │   │   └── api/              # 14 API route handlers
│   │   │   ├── components/           # UI components (sidebar, forms,
│   │   │   │                         # status badges, review actions)
│   │   │   ├── hooks/                # Custom hooks (polling)
│   │   │   ├── lib/                  # Auth, queue, file storage,
│   │   │   │                         # CSV export, constants
│   │   │   ├── worker/               # BullMQ job processor
│   │   │   └── middleware.ts         # Route protection
│   │   └── tests/                    # Vitest test suites
│   └── parser/                       # FastAPI microservice
│       ├── app/
│       │   ├── routers/              # Health + parse endpoints
│       │   ├── schemas/              # Pydantic request/response models
│       │   └── services/             # Text extraction, OCR, confidence
│       └── tests/                    # pytest test suites
├── docs/                             # Architecture documentation
├── storage/uploads/                  # Shared PDF volume (Docker mount)
├── docker-compose.yml                # 5-service orchestration
└── .env.example                      # Environment template
```

---

## Environment Variables

| Variable | Description |
|:---------|:------------|
| `POSTGRES_PASSWORD` | PostgreSQL password |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `NEXTAUTH_SECRET` | JWT signing secret (min 32 chars) |
| `NEXTAUTH_URL` | Application base URL |
| `SEED_ADMIN_EMAIL` | Initial admin email |
| `SEED_ADMIN_PASSWORD` | Initial admin password |
| `PARSER_URL` | Parser service internal URL |
| `UPLOAD_DIR` | PDF upload directory (container path) |
| `MAX_FILE_SIZE_MB` | Maximum upload size (default: 20) |

See [`.env.example`](.env.example) for all variables with defaults.

---

## License

MIT
