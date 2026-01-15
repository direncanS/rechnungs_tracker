# API Reference

## Authentication

Authentication is managed by NextAuth via `/api/auth/[...nextauth]`.

- **Login**: `signIn("credentials", { email, password, redirect: false })`
- **Session**: `GET /api/auth/session` returns `{ user: { id, email, name, role } }` or `null`
- **JWT**: httpOnly + secure + sameSite=lax cookie, 8 hour expiry

The application depends only on these session fields: `session.user.id`, `email`, `name`, `role`.

## Endpoints Summary

| # | Method | Path | Role | Purpose |
|---|--------|------|------|---------|
| 1 | GET | /api/auth/[...nextauth] | - | NextAuth handlers |
| 2 | POST | /api/auth/[...nextauth] | - | NextAuth handlers |
| 3 | POST | /api/invoices/upload | W/A/O | Upload PDF |
| 4 | GET | /api/invoices | W/A/O | Invoice list |
| 5 | GET | /api/invoices/:id | W/A/O | Invoice detail |
| 6 | GET | /api/invoices/:id/pdf | W/A/O | Serve PDF file |
| 7 | GET | /api/invoices/:id/status | W/A/O | Status polling |
| 8 | POST | /api/invoices/:id/review | A/O | Review action |
| 9 | PATCH | /api/invoices/:id/supplier | A/O | Change supplier |
| 10 | GET | /api/suppliers | A/O | Supplier list |
| 11 | GET | /api/admin/users | O | User list |
| 12 | POST | /api/admin/users | O | Create user |
| 13 | PATCH | /api/admin/users/:id | O | Update user |
| 14 | GET | /api/export/invoices/csv | O | CSV export |

W = Worker, A = Accountant, O = Owner

## DTO Exposure Rules

### Never exposed to client
- `passwordHash`, `filePath`, `fileHash`, `parserRawOutput`, `storedFilename`, `deletedAt`, `taxId` (in list), raw `parseError`

### Sanitized fields
- `parseErrorMessage`: User-friendly error message (no stack traces, no internal paths)

## Detailed Endpoint Documentation

*Detailed request/response contracts will be documented as endpoints are implemented in Phase 1.*

See Section 3 of the MVP Pressure Test document for full endpoint specifications.
