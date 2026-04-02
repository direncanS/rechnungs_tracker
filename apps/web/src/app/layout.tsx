import type { Metadata } from "next";
import AuthSessionProvider from "@/components/providers/session-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "RechnungTracker",
  description: "Supplier invoice tracking and review system",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="de">
      <body>
        <AuthSessionProvider>{children}</AuthSessionProvider>
      </body>
    </html>
  );
}
