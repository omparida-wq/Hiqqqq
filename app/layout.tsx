import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "../components/auth-gate";

export const metadata: Metadata = {
  title: "WasteWise | A little wiser. A lot greener.",
  description:
    "Find the right home for your waste. Scan, search, and sort with campus disposal rules.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
