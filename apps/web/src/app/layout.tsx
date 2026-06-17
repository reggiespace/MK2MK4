import type { Metadata } from "next";
import { Spectral, Albert_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const spectral = Spectral({
  variable: "--font-spectral",
  weight: ["600", "700", "800"],
  subsets: ["latin"],
});

const albertSans = Albert_Sans({
  variable: "--font-albert-sans",
  subsets: ["latin"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-ibm-plex-mono",
  weight: ["400", "500"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Gastric IQ — Social Content Studio",
  description: "Generate, review, and schedule social content for Gastric IQ.",
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
