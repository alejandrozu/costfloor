import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.SITE_ORIGIN ?? "http://localhost:3000"),
  title: {
    default: "CostFloor — See what remains when work is automated",
    template: "%s · CostFloor",
  },
  description:
    "An auditable scenario engine for tracing today's price into an automation-adjusted resource floor.",
  icons: {
    icon: "/og.png",
    shortcut: "/og.png",
  },
  openGraph: {
    type: "website",
    title: "CostFloor",
    description: "See what remains when work is automated.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "CostFloor — See what remains when work is automated" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "CostFloor",
    description: "See what remains when work is automated.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
