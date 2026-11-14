import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Everyday League — Big league energy. Everyday athletes.",
  description:
    "Turn your living room into a championship with local pose tracking and dramatic AI sports commentary.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
