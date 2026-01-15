# Testing Strategy

## Test Types

| Type | Framework | Location | Command |
|------|-----------|----------|---------|
| Parser unit | pytest | `apps/parser/tests/` | `cd apps/parser && pytest` |
| Parser fast | pytest | `apps/parser/tests/` | `cd apps/parser && pytest -m "not slow"` |
| Parser slow (OCR) | pytest | `apps/parser/tests/` | `cd apps/parser && pytest -m slow` |
| API routes | Vitest | `apps/web/tests/api/` | `cd apps/web && pnpm test` |
| Components | Vitest + RTL | `apps/web/tests/components/` | `cd apps/web && pnpm test` |
| E2E | Playwright | `apps/web/e2e/` | `cd apps/web && pnpm test:e2e` |

## File Naming

| Type | Pattern | Example |
|------|---------|---------|
| Parser | `test_*.py` | `test_text_extraction.py` |
| API | `*.test.ts` | `upload.test.ts` |
| Component | `*.test.tsx` | `upload-dropzone.test.tsx` |
| E2E | `*.spec.ts` | `auth.spec.ts` |

## Test Fixtures

- Parser: `apps/parser/tests/fixtures/` — sample PDFs (digital, scanned, corrupted, empty)
- E2E: `apps/web/e2e/fixtures/` — sample PDFs for upload flow testing

## Coverage Target

- Critical path: 100% (upload, parse, review, export)
- Overall: 70%+

## "Done" Criteria

A feature is done when:
1. All related tests pass
2. No security-sensitive test is skipped
3. Documentation updated (API.md, DOMAIN.md if applicable)
4. Status transition tests cover new states
5. No `any` types in TypeScript
6. No unhandled exceptions swallowed

## CI Pipeline Steps

1. `pytest -m "not slow"` — Parser fast tests (< 10s)
2. `pnpm test` — API + component tests
3. `pnpm lint` — Linting
4. `pnpm type-check` — TypeScript type checking
5. (Optional) `pytest -m slow` — Parser OCR tests
6. (Optional) `pnpm test:e2e` — E2E with Docker Compose
