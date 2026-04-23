"use client";

import { useState, useEffect, useRef } from "react";
import { ROLE_LABELS } from "@/lib/constants";
import UserForm from "@/components/user-form";

interface UserItem {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: string;
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    fetchUsers();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  async function fetchUsers() {
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/users", {
        signal: controller.signal,
      });
      if (!res.ok) throw new Error("Failed");
      const data = await res.json();
      setUsers(data.items);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return;
      setError("Failed to load users");
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }

  async function handleRoleChange(userId: string, newRole: string) {
    setMutationError(null);

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        const body = await res.json();
        setMutationError(body.error ?? "Failed to update role");
      }
    } catch {
      setMutationError("Failed to update role");
    }

    await fetchUsers();
  }

  async function handleToggleActive(userId: string, currentActive: boolean) {
    setMutationError(null);

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !currentActive }),
      });

      if (!res.ok) {
        const body = await res.json();
        setMutationError(body.error ?? "Failed to update status");
      }
    } catch {
      setMutationError("Failed to update status");
    }

    await fetchUsers();
  }

  function handleCreated() {
    setShowCreateForm(false);
    fetchUsers();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-semibold">User Management</h2>
        {!showCreateForm && (
          <button
            onClick={() => setShowCreateForm(true)}
            className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            data-testid="create-user-button"
          >
            Create User
          </button>
        )}
      </div>

      {showCreateForm && (
        <UserForm
          onCreated={handleCreated}
          onCancel={() => setShowCreateForm(false)}
        />
      )}

      {error && (
        <p className="text-sm text-red-600 mb-4" data-testid="user-error">
          {error}
        </p>
      )}

      {mutationError && (
        <p className="text-sm text-red-600 mb-4" data-testid="mutation-error">
          {mutationError}
        </p>
      )}

      {loading && !error && (
        <div className="flex justify-center py-12">
          <div className="text-sm text-gray-500">Loading...</div>
        </div>
      )}

      {!loading && !error && users.length === 0 && (
        <div className="py-12 text-center">
          <p className="text-sm text-gray-500">No users found</p>
        </div>
      )}

      {!loading && !error && users.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm" data-testid="user-table">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-gray-500 uppercase">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Role</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Created At</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr
                  key={user.id}
                  className="border-b hover:bg-gray-50"
                  data-testid="user-row"
                >
                  <td className="px-3 py-2 font-medium">{user.name}</td>
                  <td className="px-3 py-2">{user.email}</td>
                  <td className="px-3 py-2">
                    <select
                      value={user.role}
                      onChange={(e) =>
                        handleRoleChange(user.id, e.target.value)
                      }
                      className="rounded border border-gray-300 px-2 py-1 text-sm"
                      data-testid="role-select"
                    >
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-3 py-2">
                    <button
                      onClick={() =>
                        handleToggleActive(user.id, user.isActive)
                      }
                      className={`rounded-full px-3 py-0.5 text-xs font-medium ${
                        user.isActive
                          ? "bg-green-100 text-green-800"
                          : "bg-gray-100 text-gray-600"
                      }`}
                      data-testid="toggle-active"
                    >
                      {user.isActive ? "Active" : "Inactive"}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-gray-500">
                    {new Date(user.createdAt).toLocaleDateString()}
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
