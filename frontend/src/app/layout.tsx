import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
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
  /**
   * Matches the page background. The brand cyan is used for the header accent
   * and the PWA title, not as a page tint, so it does not belong here.
   */
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    /**
     * `lang` describes the language the *words* are in, which is what a screen
     * reader uses to choose a voice and a pronunciation dictionary. Every label,
     * message, and date on screen is English, so this is `en` even though the
     * money is formatted for Indonesia. A screen reader handed `id` here would
     * read English copy with Indonesian phonetics.
     */
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans antialiased`}>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Skip to content
        </a>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}