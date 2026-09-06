import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Meet & Eat",
  description: "Plan when and where to meet up and eat.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
