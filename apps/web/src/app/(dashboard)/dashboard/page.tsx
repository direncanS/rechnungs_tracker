"use client";

import { useSession } from "next-auth/react";
import { ROLE_LABELS } from "@/lib/constants";

export default function DashboardPage() {
  const { data: session } = useSession();
  const role = session?.user?.role as string;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Dashboard</h2>
      {session?.user && (
        <div className="rounded-lg border bg-white p-6">
          <p className="text-gray-700">
            Welcome, <span className="font-medium">{session.user.name}</span>
          </p>
          <p className="mt-1 text-sm text-gray-500">
            Role: {ROLE_LABELS[role] ?? role}
          </p>
        </div>
      )}
    </div>
  );
}
