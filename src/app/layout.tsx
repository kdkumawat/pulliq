import type { Metadata } from "next";
import { Plus_Jakarta_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/pulliq/theme-provider";
import { StructuredData } from "@/components/pulliq/structured-data";
import { GoogleAnalytics } from "@/components/pulliq/google-analytics";

const jakartaSans = Plus_Jakarta_Sans({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
  weight: ["400", "500", "600", "700", "800"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

const SITE_URL = "https://pulliq.app";
const TITLE = "Pulliq - Download. Inspect. Clean.";
const DESCRIPTION =
  "Download publicly accessible videos, images, and music from social links. Inspect metadata (EXIF, codec, GPS) and save a privacy-clean copy. Supports YouTube, Instagram, TikTok, X, Reddit, and more.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: TITLE,
    template: "%s - Pulliq",
  },
  description: DESCRIPTION,
  keywords: [
    "Pulliq",
    "video downloader",
    "image downloader",
    "music downloader",
    "YouTube downloader",
    "Instagram downloader",
    "TikTok downloader",
    "Reddit downloader",
    "X video downloader",
    "TikTok video downloader",
    "MP3 converter",
    "metadata remover",
    "EXIF remover",
    "privacy cleaner",
    "SoundCloud downloader",
    "social media downloader",
  ],
  authors: [{ name: "Pulliq" }],
  creator: "Pulliq",
  publisher: "Pulliq",
  applicationName: "Pulliq",
  category: "multimedia",
  alternates: {
    canonical: SITE_URL,
  },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Pulliq",
    url: SITE_URL,
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    creator: "@pulliq",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
  manifest: undefined,
};

export const viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAFAFA" },
    { media: "(prefers-color-scheme: dark)", color: "#121214" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <StructuredData />
      </head>
      <body
        className={`${jakartaSans.variable} ${jetbrainsMono.variable} font-sans antialiased bg-background text-foreground`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <GoogleAnalytics />
      </body>
    </html>
  );
}
