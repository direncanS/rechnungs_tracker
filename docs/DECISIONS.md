# Architectural Decision Records

## ADR-001: Two-Field Status Model
- **Date**: 2026-03-28
- **Context**: Invoice lifecycle has two independent concerns: automated processing and human review.
- **Decision**: Use `processingStatus` and `reviewStatus` as separate fields instead of a single combined status.
- **Alternatives**: Single status field (UPLOADED → PROCESSING → PARSED → REVIEWED → APPROVED). Rejected because processing and review are orthogonal — a parsed invoice may never be reviewed, a failed parse has no review.
- **Consequences**: More complex queries (two WHERE clauses), but clearer state machine and easier to reason about.

## ADR-002: REJECTED = Final
- **Date**: 2026-03-28
- **Context**: Should rejected invoices be re-reviewable?
- **Decision**: No. REJECTED is terminal. To resubmit, upload a new PDF.
- **Alternatives**: Allow REJECTED → NEEDS_REVIEW transition. Rejected because it complicates the state machine and audit trail.
- **Consequences**: Users must re-scan and re-upload rejected invoices. Accountants should use EDITED before APPROVED for fixable errors.

## ADR-003: No JobLog Table in MVP
- **Date**: 2026-03-28
- **Context**: Should we track BullMQ job lifecycle in a DB table?
- **Decision**: No. BullMQ's Redis-based tracking + container logs + Invoice.parseError field are sufficient.
- **Alternatives**: Dedicated JobLog table with timestamps per state.
- **Consequences**: Less DB overhead, simpler schema. Job debugging requires `docker compose logs worker`. Can add Bull Board UI in v2.

## ADR-004: Worker Inside Web Package
- **Date**: 2026-03-28
- **Context**: Should the BullMQ worker be a separate package in the monorepo?
- **Decision**: No. Worker lives in `apps/web/src/worker/` and shares Prisma client, types, and DB access.
- **Alternatives**: Separate `apps/worker/` package. Rejected because it duplicates Prisma setup, types, and increases maintenance.
- **Consequences**: Same Docker image for web and worker, different CMD. Shared code without duplication.

## ADR-005: Exact Supplier Matching
- **Date**: 2026-03-28
- **Context**: How to match parsed supplier names to existing suppliers?
- **Decision**: Normalize (lowercase + trim) and exact match on `normalizedName`.
- **Alternatives**: Fuzzy matching (Levenshtein, trigram). Rejected because it requires NLP complexity and may create false matches.
- **Consequences**: "Rewe Markt Berlin" and "Rewe Wien" are different suppliers unless manually merged. Accountant corrects during review.

## ADR-006: NextAuth Credentials Provider
- **Date**: 2026-03-28
- **Context**: Authentication strategy for local network deployment.
- **Decision**: NextAuth with Credentials Provider (email + password, bcrypt hashing, JWT in httpOnly cookie).
- **Alternatives**: OAuth/SSO (unnecessary for local deployment), custom auth (reinventing the wheel).
- **Consequences**: Simple setup, no external auth provider dependency. No password change in MVP (owner resets via DB or re-creation).

## ADR-007: Prisma ORM
- **Date**: 2026-03-28
- **Context**: Database access layer choice.
- **Decision**: Prisma with PostgreSQL.
- **Alternatives**: Raw SQL (more control but no type safety), Drizzle (newer, less mature), Knex (query builder only).
- **Consequences**: Type-safe queries, auto-generated migrations, schema as code. Slightly less control over complex queries.

## ADR-008: BullMQ for Async Processing
- **Date**: 2026-03-28
- **Context**: PDF parsing takes 5-30+ seconds, cannot block HTTP request.
- **Decision**: BullMQ (Redis-backed job queue) with separate worker process.
- **Alternatives**: Cron job polling DB (fragile, no retry), in-process async (blocks event loop), pg-boss (PostgreSQL-based).
- **Consequences**: Reliable retry with exponential backoff, separate scaling, well-supported library. Requires Redis.

## ADR-009: Separate Parser Service
- **Date**: 2026-03-28
- **Context**: PDF parsing uses Python libraries (pdfplumber, Tesseract) not available in Node.js.
- **Decision**: Separate FastAPI service in Python, called via HTTP from the Node.js worker.
- **Alternatives**: Python subprocess from Node.js (complex IPC), Node.js PDF libraries (less capable for OCR).
- **Consequences**: Clean separation, independent scaling, Docker isolation for security (Tesseract runs in sandboxed container). HTTP overhead is negligible for 5-30s parse jobs.

## ADR-010: APP_BOOT_PHASE Flag
- **Date**: 2026-03-28
- **Context**: Phase 0 scaffold validation needs all services to start before migrations exist. Worker depends on web health, but web health requires sentinel from migration.
- **Decision**: `APP_BOOT_PHASE` environment variable (0 = skip migration/sentinel, 1 = full boot). Phase 0 uses `docker-compose.phase0.yml` override.
- **Alternatives**: Separate Phase 0 docker-compose without dependencies. Rejected because it diverges from production config.
- **Consequences**: Same docker-compose.yml for all phases, only health check behavior differs. Clear phase separation.
