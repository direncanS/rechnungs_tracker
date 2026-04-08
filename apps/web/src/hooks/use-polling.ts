"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { STATUS_POLL_INTERVAL_MS } from "@/lib/constants";

interface PollingResult {
  processingStatus: string | null;
  reviewStatus: string | null;
  parseError: string | null;
  isPolling: boolean;
  error: string | null;
}

const TERMINAL_STATUSES = ["PARSED", "FAILED_PARSE"];
const MAX_CONSECUTIVE_ERRORS = 3;

export function usePolling(
  invoiceId: string | null,
  options?: { interval?: number; enabled?: boolean }
): PollingResult {
  const interval = options?.interval ?? STATUS_POLL_INTERVAL_MS;
  const enabled = options?.enabled ?? true;

  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<string | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isPolling, setIsPolling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const errorCountRef = useRef(0);
  const intervalIdRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchStatus = useCallback(async () => {
    if (!invoiceId) return;

    try {
      const res = await fetch(`/api/invoices/${invoiceId}/status`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      errorCountRef.current = 0;
      setError(null);
      setProcessingStatus(data.processingStatus);
      setReviewStatus(data.reviewStatus);
      setParseError(data.parseError ?? null);

      if (TERMINAL_STATUSES.includes(data.processingStatus)) {
        setIsPolling(false);
        if (intervalIdRef.current) {
          clearInterval(intervalIdRef.current);
          intervalIdRef.current = null;
        }
      }
    } catch {
      errorCountRef.current += 1;
      if (errorCountRef.current >= MAX_CONSECUTIVE_ERRORS) {
        setError("Status updates are temporarily unavailable");
        setIsPolling(false);
        if (intervalIdRef.current) {
          clearInterval(intervalIdRef.current);
          intervalIdRef.current = null;
        }
      }
    }
  }, [invoiceId]);

  useEffect(() => {
    if (!invoiceId || !enabled) {
      setIsPolling(false);
      return;
    }

    errorCountRef.current = 0;
    setError(null);
    setIsPolling(true);

    // Immediate first fetch
    fetchStatus();

    intervalIdRef.current = setInterval(fetchStatus, interval);

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
    };
  }, [invoiceId, enabled, interval, fetchStatus]);

  return { processingStatus, reviewStatus, parseError, isPolling, error };
}
