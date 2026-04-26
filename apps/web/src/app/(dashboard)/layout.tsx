"use client";

import { useState } from "react";
import Sidebar from "@/components/nav/sidebar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-gray-50">
      <div className="fixed top-0 left-0 right-0 z-30 flex items-center border-b bg-white px-4 py-3 md:hidden">
        <button
          onClick={() => setSidebarOpen(true)}
          className="mr-3 rounded p-1 hover:bg-gray-100"
          data-testid="mobile-menu-button"
          aria-label="Open menu"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
        <span className="text-sm font-bold">RechnungTracker</span>
      </div>

      <Sidebar
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <main className="flex-1 overflow-y-auto pt-16 p-6 md:pt-6">
        {children}
      </main>
    </div>
  );
}
