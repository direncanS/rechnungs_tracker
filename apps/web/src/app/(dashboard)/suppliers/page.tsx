"use client";

import { useState, useEffect, useRef } from "react";

interface SupplierItem {
  id: string;
  name: string;
  address: string | null;
  createdAt: string;
}

export default function SuppliersPage() {
  const [items, setItems] = useState<SupplierItem[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetchSuppliers("");
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

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set("search", query.trim());
      const res = await fetch(`/api/suppliers?${params.toString()}`, {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setItems(data.items);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError("Failed to load suppliers");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Suppliers</h2>

      <div className="mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search suppliers..."
          className="w-full max-w-sm rounded border border-gray-300 px-3 py-2 text-sm"
          data-testid="supplier-search"
        />
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {loading && !error && (
        <div className="flex justify-center py-12">
          <div className="text-sm text-gray-500">Loading...</div>
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <div className="py-12 text-center" data-testid="supplier-empty">
          <p className="text-sm text-gray-500">No suppliers found</p>
        </div>
      )}

      {!loading && !error && items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="supplier-table">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Address</th>
                <th className="px-3 py-2">Created At</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.id}
                  className="border-b hover:bg-gray-50"
                  data-testid="supplier-row"
                >
                  <td className="px-3 py-2 font-medium">{item.name}</td>
                  <td className="px-3 py-2">{item.address ?? "-"}</td>
                  <td className="px-3 py-2 text-gray-500">
                    {new Date(item.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
