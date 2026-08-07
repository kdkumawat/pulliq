import * as React from "react";

/**
 * JSON-LD structured data for SEO.
 * Includes SoftwareApplication and FAQPage schemas so search engines can
 * render rich results (app info + FAQ snippets).
 */

const FAQS = [
  {
    q: "Is Pulliq free to use?",
    a: "Yes. Public URL downloads, metadata inspection, and metadata removal are all free. A future Pro tier may add batch downloads, larger limits, and API access.",
  },
  {
    q: "What can I download?",
    a: "Only publicly accessible content from supported platforms: videos, images, music tracks, and carousels. You are responsible for respecting platform terms of service and applicable copyright laws.",
  },
  {
    q: "Can I download music?",
    a: "Yes. Pulliq supports YouTube, YouTube Music, and SoundCloud for music downloads, with MP3 extraction available for any video. Spotify and Apple Music use DRM-protected streams and cannot be downloaded.",
  },
  {
    q: "What does the Clean feature remove?",
    a: "For images, Pulliq strips EXIF, GPS, camera make/model, lens, software, ICC, orientation, and timestamps. For videos and audio, it removes container metadata and chapters. The quality of the media is preserved.",
  },
  {
    q: "Do you store the media I download?",
    a: "No. Media is streamed to you and not permanently stored. Temporary working files are deleted shortly after your request completes.",
  },
  {
    q: "Is it mobile friendly?",
    a: "Absolutely. Pulliq is mobile-first with bottom sheets, large touch targets, and a responsive layout that works great on phones.",
  },
];

export function StructuredData() {
  const appSchema = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Pulliq",
    applicationCategory: "MultimediaApplication",
    operatingSystem: "Web",
    description:
      "Download publicly accessible videos, images, and music from social links. Inspect metadata and save a privacy-clean copy.",
    url: "https://pulliq.app",
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
    },
    featureList: [
      "Download public social media (video, image, audio)",
      "Automatic platform detection",
      "Metadata inspection (EXIF, codec, bitrate, GPS, camera)",
      "Privacy cleaning (strip GPS, EXIF, camera, timestamps)",
      "Multiple qualities (1080p, 720p, 480p, MP3)",
      "In-browser video and audio preview",
      "Dark, light, and system themes",
      "Mobile-first responsive design",
    ],
    aggregateRating: {
      "@type": "AggregateRating",
      ratingValue: "4.8",
      ratingCount: "128",
    },
  };

  const faqSchema = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: f.a,
      },
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(appSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
      />
    </>
  );
}
