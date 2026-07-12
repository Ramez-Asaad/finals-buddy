import type { Metadata } from "next";
import { Outfit, Fraunces } from "next/font/google";
import "./globals.css";
import 'katex/dist/katex.min.css';
import { Toaster } from "../components/Toast";

// Body: quiet, legible sans
const outfit = Outfit({
  variable: "--font-body",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Display: bookish serif, used with restraint on the wordmark, subject names,
// headings and big numbers — the fastest "a human chose this" signal
const fraunces = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Finals Buddy — your study desk for exam season",
  description: "Turn your lecture notes into summaries, flashcards, quizzes and a plan that keeps pace with your exam dates.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full dark" suppressHydrationWarning>
      <body className={`${outfit.variable} ${fraunces.variable} min-h-full flex flex-col`} suppressHydrationWarning>
        {children}
        <Toaster />
      </body>
    </html>
  );
}
