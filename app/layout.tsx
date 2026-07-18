import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Suspense } from "react";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { AppShell } from "@/components/AppShell";

const generalSans = localFont({
  src: [
    { path: "../public/fonts/GeneralSans-Variable.woff2", weight: "200 700", style: "normal" },
    { path: "../public/fonts/GeneralSans-VariableItalic.woff2", weight: "200 700", style: "italic" },
  ],
  variable: "--font-general-sans",
});

const clashDisplay = localFont({
  src: "../public/fonts/ClashDisplay-Semibold.woff2",
  variable: "--font-clash-display",
  weight: "600",
});

export const metadata: Metadata = {
  title: "Commonplaces",
  description: "Our favourite restaurants, on a map.",
};

// Disables the browser's own pinch/double-tap page zoom, which otherwise fights
// with the Google Map's own pinch-to-zoom gesture on touch devices.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${generalSans.variable} ${clashDisplay.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="flex h-full flex-col">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Suspense>
            <AppShell>{children}</AppShell>
          </Suspense>
        </ThemeProvider>
      </body>
    </html>
  );
}
