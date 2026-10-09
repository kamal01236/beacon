import type { Metadata } from "next";
import "./globals.css";
import { RoleProvider } from "@/components/RoleProvider";
import { AppShell } from "@/components/AppShell";

export const metadata: Metadata = {
  title: "Beacon",
  description:
    "An AI companion layer over Jira / Azure DevOps that surfaces hidden blockers, explains attention, and keeps delivery honest.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>
        <RoleProvider>
          <AppShell>{children}</AppShell>
        </RoleProvider>
      </body>
    </html>
  );
}
