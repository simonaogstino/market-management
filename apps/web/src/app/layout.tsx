import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Market Management",
  description: "Retail market management — admin & sync API",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
