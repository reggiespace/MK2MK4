import type { Metadata } from "next";
import { Spectral, Albert_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

// Weights and styles match the design's type system: Spectral carries the
// display/serif headings (including the italic pull quotes), Albert Sans the
// UI and body, IBM Plex Mono the kickers, labels and counters.
const spectral = Spectral({
  variable: "--font-spectral",
  weight: ["500", "600", "700", "800"],
  style: ["normal", "italic"],
  subsets: ["latin"],
});

const albertSans = Albert_Sans({
  variable: "--font-albert-sans",
  weight: ["400", "500", "600", "700", "800"],
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ReggieSpace Social Studio",
  description: "Create, review, and schedule social content from one studio.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${spectral.variable} ${albertSans.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
