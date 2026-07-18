import type { Metadata } from "next";
import { DM_Mono } from "next/font/google";
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

const dmMono = DM_Mono({
  variable: "--font-dm-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${generalSans.variable} ${dmMono.variable} ${clashDisplay.variable} h-full antialiased`}
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
