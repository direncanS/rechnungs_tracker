# Domain Glossary & Business Rules

## Core Concepts

### Invoice (Fatura)
A supplier invoice uploaded as PDF. Goes through automated parsing and manual review before being verified.

### Supplier (Tedarikci)
A company that sends invoices. Created automatically by the parser during PDF processing. Can be corrected by accountants during review.

### Review
The process where an accountant examines parsed invoice data, corrects errors, and approves or rejects the invoice.

### Roles

| Role | Description | Can Do |
|------|-------------|--------|
| **Worker** | Uploads invoices, views own uploads | Upload PDF, view own invoices |
| **Accountant** | Reviews and approves invoices | Everything Worker can + review/edit all invoices, manage suppliers |
| **Owner** | System administrator | Everything Accountant can + user management, CSV export |

## Status Model

RechnungTracker uses a **two-field status model**: `processingStatus` (automated pipeline) and `reviewStatus` (human review).

### ProcessingStatus

| Value | Meaning |
|-------|---------|
| `UPLOADED` | File saved to disk, not yet queued for processing |
| `QUEUED` | Job enqueued in BullMQ, waiting for worker |
| `PROCESSING` | Worker is actively parsing the PDF |
| `PARSED` | Parsing completed successfully |
| `FAILED_PARSE` | All parse attempts failed (terminal state) |

**Valid Transitions:**
```
UPLOADED → QUEUED        (job enqueued successfully)
QUEUED → PROCESSING      (worker picks up the job)
PROCESSING → PARSED      (parser returns success)
PROCESSING → FAILED_PARSE (all 3 attempts exhausted)
```

### ReviewStatus

| Value | Meaning |
|-------|---------|
| `PENDING` | No review possible yet (parsing not complete) |
| `NEEDS_REVIEW` | Parsing done, awaiting accountant review |
| `VERIFIED` | Accountant approved the invoice |
| `REJECTED` | Accountant rejected the invoice (terminal) |

**Valid Transitions:**
```
PENDING → NEEDS_REVIEW   (processingStatus becomes PARSED)
NEEDS_REVIEW → NEEDS_REVIEW (EDITED action — intermediate audit record)
NEEDS_REVIEW → VERIFIED  (APPROVED action)
NEEDS_REVIEW → REJECTED  (REJECTED action + mandatory comment)
```

### Valid Status Combinations

| processingStatus | reviewStatus | Meaning |
|-----------------|--------------|---------|
| UPLOADED | PENDING | File saved, not yet queued (or enqueue failed) |
| QUEUED | PENDING | In queue, waiting for worker |
| PROCESSING | PENDING | Being parsed |
| PARSED | NEEDS_REVIEW | Parse done, awaiting review |
| PARSED | VERIFIED | Approved by accountant |
| PARSED | REJECTED | Rejected by accountant |
| FAILED_PARSE | PENDING | Parse failed, no review possible |

### Invalid Transitions (always rejected)

| Transition | Why |
|-----------|-----|
| PENDING → VERIFIED | Cannot review before parsing completes |
| PENDING → REJECTED | Cannot review before parsing completes |
| VERIFIED → REJECTED | Verified invoices cannot be rejected |
| REJECTED → NEEDS_REVIEW | Rejected is final |
| REJECTED → VERIFIED | Rejected is final |
| FAILED_PARSE + NEEDS_REVIEW | Parse failed = no review |
| FAILED_PARSE + VERIFIED | Parse failed = cannot approve |

## Business Rules

### Duplicate Detection
- SHA-256 hash computed from file content before saving
- If hash exists in DB (including soft-deleted invoices), upload returns 409
- No new invoice record is created for duplicates

### Rejected = Final
- Once rejected, an invoice cannot be re-reviewed
- To resubmit: scan again and upload as new PDF
- Accountant should use EDITED to fix errors before APPROVED

### Soft Delete
- Invoices are soft-deleted (deletedAt timestamp)
- All user-facing queries filter `deletedAt IS NULL`
- Exception: duplicate hash detection includes soft-deleted invoices

### Supplier Matching
- Parser extracts supplier name from invoice text
- Name is normalized: lowercase + trim
- Exact normalized match against existing suppliers
- No fuzzy matching in MVP

### Review Workflow
1. Accountant opens invoice with `reviewStatus = NEEDS_REVIEW`
2. If edits needed: submit EDITED action (saves changes, status stays NEEDS_REVIEW)
3. If supplier wrong: use supplier change endpoint (creates audit record)
4. Final decision: submit APPROVED (→ VERIFIED) or REJECTED (→ REJECTED + comment)

### FAILED_PARSE Terminal State
Covers all non-recoverable processing failures:
- Parse/OCR failure
- Parser timeout exhaustion (3 attempts)
- Worker-side DB persistence failure
Root cause recorded in `Invoice.parseError` and container logs.

## Entities

| Entity | Purpose | Count in MVP |
|--------|---------|-------------|
| User | System users with role-based access | 5 fields + audit |
| Supplier | Invoice sender companies | 6 fields |
| Invoice | Core invoice record with file + parsed data | 20+ fields |
| InvoiceItem | Line items within an invoice | 10 fields |
| InvoiceReview | Audit trail for review actions | 5 fields |
