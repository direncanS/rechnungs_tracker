// Label maps and config constants
// Status enums are defined in Prisma schema (source of truth)
// This file only contains display labels and config values

export const PROCESSING_STATUS_LABELS: Record<string, string> = {
  UPLOADED: "Uploaded",
  QUEUED: "Queued",
  PROCESSING: "Processing",
  PARSED: "Parsed",
  FAILED_PARSE: "Failed",
};

export const REVIEW_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  NEEDS_REVIEW: "Needs Review",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

export const ROLE_LABELS: Record<string, string> = {
  WORKER: "Worker",
  ACCOUNTANT: "Accountant",
  OWNER: "Owner",
};

export const MAX_FILE_SIZE_BYTES = 20 * 1024 * 1024; // 20MB
export const MAX_PAGE_SIZE = 100;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_EXPORT_ROWS = 1000;
export const PDF_MAGIC_BYTES = "%PDF-";
export const STATUS_POLL_INTERVAL_MS = 2000;
export const SESSION_MAX_AGE_SECONDS = 8 * 60 * 60; // 8 hours
