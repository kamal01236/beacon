import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RoleProvider } from "@/components/RoleProvider";
import { AppShell } from "@/components/AppShell";
import { BOOT_SCRIPT } from "@/lib/prefs";

export const metadata: Metadata = {
  title: "Beacon",
  description:
    "An AI companion layer over Jira / Azure DevOps that surfaces hidden blockers, explains attention, and keeps delivery honest.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Matches --navy in each theme, so the mobile browser chrome belongs to the app.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0F2A4A" },
    { media: "(prefers-color-scheme: dark)", color: "#0C1725" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap"
        />
        {/* Paints the viewer's theme and density before first paint, so the app
            never flashes the wrong one. Reads localStorage only. */}
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body>
        <RoleProvider>
          <AppShell>{children}</AppShell>
        </RoleProvider>
      </body>
    </html>
  );
}
