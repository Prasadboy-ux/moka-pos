import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Moka Cafe POS",
    template: "%s | Moka Cafe POS",
  },
  description: "Point of sale for Moka Cafe",
  appleWebApp: {
    title: "Moka Cafe POS",
  },
};

export const viewport: Viewport = {
  themeColor: "#00c4df",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        {children}
      </body>
    </html>
  );
}