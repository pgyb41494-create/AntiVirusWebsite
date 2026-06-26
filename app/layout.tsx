import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SystemPulse | Command Center",
  description: "Antivirus research telemetry dashboard",
  icons: { icon: "/logo.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
