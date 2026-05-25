import type { Metadata } from "next";
import { Tomorrow } from "next/font/google";
import "./globals.css";

const tomorrow = Tomorrow({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-tomorrow",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Illuminati — Council of AI Minds",
  description: "A multi-LLM council chat interface where Claude, GPT-4, Gemini, and Grok deliberate and synthesize answers.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${tomorrow.variable} h-full`}>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
