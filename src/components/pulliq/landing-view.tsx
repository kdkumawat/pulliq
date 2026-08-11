"use client";

import * as React from "react";
import { motion } from "framer-motion";
import {
  Download,
  ScanSearch,
  ShieldCheck,
  ArrowRight,
  Check,
  Zap,
  Eye,
  ShieldOff,
  Smartphone,
  Moon,
  Layers,
  ChevronDown,
  Gauge,
  Lock,
  Music,
} from "lucide-react";
import { UrlAnalyzeBar } from "./url-analyze-bar";
import { PlatformIcon, PlatformTile } from "./platform-icon";
import { PLATFORMS } from "@/lib/media/platform";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function LandingView() {
  return (
    <div>
      <Hero />
      <PlatformStrip />
      <div className="grid gap-10 lg:grid-cols-2 lg:gap-8">
        <PlatformsSection />
        <FeaturesSection />
      </div>
      <HowItWorks />
      <FaqSection />
    </div>
  );
}

/* ----------------------------- Hero ----------------------------- */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Backdrop */}
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-grid opacity-60" />
        <div className="absolute left-1/2 top-[-10%] h-[360px] w-[760px] max-w-[120vw] -translate-x-1/2 glow-blue" />
      </div>

      <div className="mx-auto max-w-3xl px-4 pt-14 pb-10 text-center sm:px-6 sm:pt-16 sm:pb-12">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="mx-auto inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/60 px-3.5 py-1.5 text-xs font-medium text-muted-foreground backdrop-blur"
        >
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-success" />
          </span>
          Now with metadata inspection &amp; privacy cleaning
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.05 }}
          className="mt-5 text-balance text-4xl font-semibold tracking-tight sm:text-5xl md:text-6xl"
        >
          Download. Inspect. Clean.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.12 }}
          className="mx-auto mt-4 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg"
        >
          Download publicly accessible videos, images, and music from social
          links. See exactly what&apos;s inside, and save a privacy-clean copy.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.2 }}
          className="mx-auto mt-7 max-w-xl"
        >
          <UrlAnalyzeBar autoFocus />
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.35 }}
          className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-muted-foreground"
        >
          <span className="inline-flex items-center gap-1.5">
            <Lock className="h-3.5 w-3.5" /> No login required
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Analyze in seconds
          </span>
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> Privacy-first
          </span>
        </motion.div>
      </div>
    </section>
  );
}

/* -------------------------- Platform strip -------------------------- */

function PlatformStrip() {
  // Duplicate the list so the marquee loops seamlessly.
  const loop = [...PLATFORMS, ...PLATFORMS];
  return (
    <section className="border-y border-border/50 bg-background/40 py-5">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <p className="mb-3 text-center text-xs font-medium uppercase tracking-wider text-muted-foreground">
          Works with public links from
        </p>
        <div className="marquee-mask relative overflow-hidden">
          <div className="marquee-track items-center gap-3">
            {loop.map((p, i) => (
              <div
                key={`${p.id}-${i}`}
                className="flex shrink-0 items-center gap-2 rounded-full border border-border/60 bg-card/60 px-3.5 py-1.5"
              >
                <PlatformIcon platform={p.id} className="h-5 w-5" />
                <span className="text-sm font-medium">{p.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------- Platforms section ------------------------- */

function PlatformsSection() {
  return (
    <Section id="platforms" eyebrow="Supported platforms" title="Every major platform">
      <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 sm:gap-3">
        {PLATFORMS.map((p, i) => (
          <motion.div
            key={p.id}
            initial={{ opacity: 0, y: 10 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.35, delay: (i % 4) * 0.03 }}
            className="flex flex-col items-center gap-2 rounded-2xl border border-border/70 bg-card p-3 text-center sm:p-4"
          >
            <PlatformTile platform={p.id} className="h-10 w-10 sm:h-11 sm:w-11" />
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold sm:text-sm">{p.name}</div>
              <div className="mt-0.5 hidden truncate text-[11px] text-muted-foreground sm:block">{p.domain}</div>
            </div>
          </motion.div>
        ))}
      </div>
    </Section>
  );
}

/* --------------------------- Features --------------------------- */

const FEATURES = [
  {
    icon: Download,
    title: "Download",
    color: "var(--primary)",
    desc: "Paste any public social link. Pulliq detects the platform automatically and fetches the highest quality - no dropdowns, no clutter.",
    points: ["Auto platform detection", "Video, images, music & MP3", "Carousels, reels & clips"],
  },
  {
    icon: ScanSearch,
    title: "Inspect",
    color: "var(--chart-3)",
    desc: "See exactly what's inside the file before you save it. File, image, video, audio, and social metadata - every field shown as Present or Not Present.",
    points: ["EXIF, GPS, camera, lens", "Codec, bitrate, HDR, color space", "Artist, album, sample rate"],
  },
  {
    icon: ShieldCheck,
    title: "Clean",
    color: "var(--success)",
    desc: "Save a privacy-clean copy with one click. Strip GPS, EXIF, camera, software, author, comments, and timestamps before the file touches your device.",
    points: ["Removes GPS & EXIF", "Strips camera & software", "Keeps the visual quality"],
  },
];

function FeaturesSection() {
  return (
    <Section id="features" eyebrow="Why Pulliq" title="Not just a downloader">
      <p className="-mt-1 text-sm text-muted-foreground sm:text-base">
        Pulliq combines three capabilities in one polished experience - so you
        always know what you&apos;re saving.
      </p>
      <div className="mt-5 grid gap-3">
        {FEATURES.map((f, i) => (
          <motion.div
            key={f.title}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-40px" }}
            transition={{ duration: 0.4, delay: i * 0.07 }}
          >
            <Card className="group overflow-hidden border-border/70 transition-all hover:shadow-md">
              <CardContent className="flex items-start gap-3 p-3 sm:p-4">
                <div
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl sm:h-10 sm:w-10"
                  style={{
                    backgroundColor: `color-mix(in srgb, ${f.color} 14%, transparent)`,
                    color: f.color,
                  }}
                >
                  <f.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-semibold tracking-tight sm:text-lg">{f.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">{f.desc}</p>
                  <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                    {f.points.map((pt) => (
                      <li key={pt} className="flex items-center gap-1.5 text-xs">
                        <Check className="h-3 w-3 shrink-0" style={{ color: f.color }} />
                        <span className="text-foreground/90">{pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Sub-feature grid */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <SubFeature icon={Gauge} title="Fast" desc="Analyze in seconds" />
        <SubFeature icon={Music} title="Music" desc="YT Music, SoundCloud, MP3" />
        <SubFeature icon={Moon} title="Dark mode" desc="System, light, dark" />
        <SubFeature icon={Layers} title="Multiple qualities" desc="Up to 1080p + MP3" />
      </div>
    </Section>
  );
}

function SubFeature({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/50 p-2.5 sm:p-3">
      <Icon className="h-4 w-4 text-primary sm:h-5 sm:w-5" />
      <div className="mt-1.5 text-xs font-semibold sm:text-sm">{title}</div>
      <div className="mt-0.5 text-[11px] text-muted-foreground sm:text-xs">{desc}</div>
    </div>
  );
}

/* -------------------------- How it works -------------------------- */

const STEPS = [
  { icon: Layers, title: "Paste URL", desc: "Drop in any public link. No login, no setup." },
  { icon: ScanSearch, title: "Analyze", desc: "Pulliq detects the platform, extracts media, inspects metadata." },
  { icon: Eye, title: "Preview", desc: "See the preview and every metadata field at a glance." },
  { icon: ShieldOff, title: "Clean (optional)", desc: "Remove GPS, EXIF, camera, and other identifying metadata." },
  { icon: Download, title: "Download", desc: "Save the original - or a clean copy - in the quality you want." },
];

function HowItWorks() {
  return (
    <Section id="how" eyebrow="How it works" title="From link to clean file in seconds">
      <div className="relative mt-6">
        <div className="absolute left-0 right-0 top-6 hidden h-px bg-border/70 lg:block" />
        <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-5 lg:gap-5">
          {STEPS.map((s, i) => (
            <motion.div
              key={s.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.35, delay: i * 0.06 }}
              className="relative flex flex-col items-center text-center"
            >
              <div className="relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl border border-border bg-card shadow-sm">
                <s.icon className="h-5 w-5 text-primary" />
                <span className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                  {i + 1}
                </span>
              </div>
              <h3 className="mt-3 text-sm font-semibold">{s.title}</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{s.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------ FAQ ------------------------------ */

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
    a: "Yes. Pulliq supports YouTube, YouTube Music, and SoundCloud for music downloads, with MP3 extraction available for any video. Spotify and Apple Music use DRM-protected streams and can't be downloaded.",
  },
  {
    q: "What does \"Clean\" actually remove?",
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

function FaqSection() {
  return (
    <Section id="faq" eyebrow="FAQ" title="Questions, answered">
      <div className="mx-auto max-w-3xl rounded-3xl border border-border/70 bg-card overflow-hidden">
        <Accordion type="single" collapsible className="w-full">
          {FAQS.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-border/60 px-5 sm:px-6">
              <AccordionTrigger className="text-left text-sm font-semibold hover:no-underline sm:text-[15px] py-4">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-xs leading-relaxed text-muted-foreground sm:text-sm pb-4">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Section>
  );
}

/* ----------------------------- Section ----------------------------- */

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id?: string;
  eyebrow?: string;
  title?: string;
  children?: React.ReactNode;
}) {
  return (
    <section id={id} className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-12 scroll-mt-20">
      {(eyebrow || title) && (
        <div className="mb-5">
          {eyebrow && (
            <div className="text-xs font-semibold uppercase tracking-wider text-primary">
              {eyebrow}
            </div>
          )}
          {title && (
            <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl text-balance">
              {title}
            </h2>
          )}
        </div>
      )}
      {children}
    </section>
  );
}
