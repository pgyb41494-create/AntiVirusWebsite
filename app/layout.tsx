import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AV Tester Dashboard",
  description: "Antivirus research simulation dashboard",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
