import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Mock KHQR Store",
  description: "Simple checkout sandbox for KHQR checkout integration testing",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
