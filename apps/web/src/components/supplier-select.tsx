"use client";

import { useState, useRef, useEffect } from "react";

interface SupplierInfo {
  id: string;
  name: string;
  address: string | null;
}

interface SupplierSelectProps {
  invoiceId: string;
  currentSupplier: SupplierInfo | null;
  onSupplierChanged: () => void;
}

export default function SupplierSelect({
  invoiceId,
  currentSupplier,
  onSupplierChanged,
}: SupplierSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<SupplierInfo[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConflict, setIsConflict] = useState(false);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleSearchChange(value: string) {
    setSearch(value);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      fetchSuppliers(value);
    }, 300);
  }

  async function fetchSuppliers(query: string) {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      const res = await fetch(`/api/suppliers?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setResults(data.items);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setResults([]);
    }
  }

  async function handleSelect(supplierId: string) {
    setSubmitting(true);
    setError(null);
    setIsConflict(false);

    try {
      const res = await fetch(`/api/invoices/${invoiceId}/supplier`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ supplierId }),
      });

      if (res.status === 409) {
        setIsConflict(true);
        setError("Conflict: invoice state changed. Please reload.");
        return;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(
          (data as { error?: string }).error ?? "Failed to change supplier"
        );
        return;
      }

      setOpen(false);
      setSearch("");
      onSupplierChanged();
    } catch {
      setError("Failed to change supplier");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div data-testid="supplier-select">
      <div className="text-sm mb-2" data-testid="current-supplier">
        <span className="font-medium">Supplier: </span>
        {currentSupplier ? (
          <span>
            {currentSupplier.name}
            {currentSupplier.address && (
              <span className="text-gray-500 ml-1">
                ({currentSupplier.address})
              </span>
            )}
          </span>
        ) : (
          <span className="text-gray-500">No supplier</span>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-600 mb-2" data-testid="supplier-error">
          {error}
          {isConflict && (
            <button
              onClick={() => window.location.reload()}
              className="ml-2 text-blue-600 hover:underline"
            >
              Reload
            </button>
          )}
        </div>
      )}

      {!open && (
        <button
          onClick={() => {
            setOpen(true);
            setError(null);
            fetchSuppliers("");
          }}
          className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          data-testid="change-supplier-button"
        >
          Change Supplier
        </button>
      )}

      {open && (
        <div className="border rounded p-3 space-y-2">
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search suppliers..."
            className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm"
            data-testid="supplier-search"
          />
          <div className="max-h-48 overflow-y-auto">
            {results.map((s) => (
              <button
                key={s.id}
                onClick={() => handleSelect(s.id)}
                disabled={submitting}
                className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
                data-testid="supplier-option"
              >
                <span className="font-medium">{s.name}</span>
                {s.address && (
                  <span className="text-gray-500 ml-1">({s.address})</span>
                )}
              </button>
            ))}
            {results.length === 0 && (
              <p className="text-sm text-gray-500 px-3 py-2">
                No suppliers found
              </p>
            )}
          </div>
          <button
            onClick={() => {
              setOpen(false);
              setSearch("");
            }}
            className="text-sm text-gray-500 hover:underline"
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
