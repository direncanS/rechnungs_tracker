"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";

interface NavItem {
  href: string;
  label: string;
  minRole: "WORKER" | "ACCOUNTANT" | "OWNER";
}

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", minRole: "WORKER" },
  { href: "/invoices", label: "Invoices", minRole: "WORKER" },
  { href: "/upload", label: "Upload", minRole: "WORKER" },
  { href: "/suppliers", label: "Suppliers", minRole: "ACCOUNTANT" },
  { href: "/admin/users", label: "Users", minRole: "OWNER" },
  { href: "/export", label: "Export", minRole: "OWNER" },
];

const ROLE_LEVEL: Record<string, number> = {
  WORKER: 0,
  ACCOUNTANT: 1,
  OWNER: 2,
};

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user?.role as string) ?? "WORKER";
  const userLevel = ROLE_LEVEL[role] ?? 0;

  const visibleItems = NAV_ITEMS.filter(
    (item) => userLevel >= ROLE_LEVEL[item.minRole]
  );

  return (
    <aside className="flex h-full w-56 flex-col border-r bg-white" data-testid="sidebar">
      <div className="border-b px-4 py-4">
        <h1 className="text-lg font-bold">RechnungTracker</h1>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <ul className="space-y-1">
          {visibleItems.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`block rounded px-3 py-2 text-sm font-medium ${
                    active
                      ? "bg-blue-50 text-blue-700"
                      : "text-gray-700 hover:bg-gray-100"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t px-4 py-3">
        <div className="mb-2 text-xs text-gray-500">
          <div className="truncate font-medium text-gray-700" data-testid="user-name">
            {session?.user?.name}
          </div>
          <div className="truncate" data-testid="user-role">{role}</div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full rounded border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
          data-testid="logout-button"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
