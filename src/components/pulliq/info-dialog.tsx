"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Check, ShieldCheck, ScanSearch, Download, AlertTriangle } from "lucide-react";

export type DocKind = "about" | "privacy" | "terms";

interface InfoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doc: DocKind | null;
}

export function InfoDialog({ open, onOpenChange, doc }: InfoDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] gap-0 overflow-hidden p-0 sm:max-w-2xl">
        <DialogHeader className="border-b border-border/60 px-6 py-4">
          <DialogTitle className="text-lg">{titleFor(doc)}</DialogTitle>
          <DialogDescription className="sr-only">{titleFor(doc)}</DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[70vh]">
          <div className="px-6 py-5">
            <DocContent doc={doc} />
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}

function titleFor(doc: DocKind | null) {
  switch (doc) {
    case "about":
      return "About Pulliq";
    case "privacy":
      return "Privacy Policy";
    case "terms":
      return "Terms of Service";
    default:
      return "";
  }
}

/* ----------------------------- Doc content ----------------------------- */

function DocContent({ doc }: { doc: DocKind | null }) {
  if (doc === "about") return <AboutContent />;
  if (doc === "privacy") return <PrivacyContent />;
  if (doc === "terms") return <TermsContent />;
  return null;
}

function AboutContent() {
  return (
    <article className="space-y-4 text-sm leading-relaxed text-muted-foreground">
      <p>
        <span className="font-semibold text-foreground">Pulliq</span> is a premium media
        downloader that gives you complete visibility into the files you save. Unlike
        traditional downloaders, Pulliq lets you download publicly accessible media,
        inspect its metadata, and save a privacy-clean copy - all in one polished
        experience.
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {[
          { icon: Download, t: "Download", d: "Public social media, fast." },
          { icon: ScanSearch, t: "Inspect", d: "Every metadata field, visible." },
          { icon: ShieldCheck, t: "Clean", d: "Remove identifying metadata." },
        ].map((x) => (
          <div key={x.t} className="rounded-2xl border border-border/60 bg-background/40 p-3">
            <x.icon className="h-5 w-5 text-primary" />
            <div className="mt-2 text-sm font-semibold text-foreground">{x.t}</div>
            <div className="text-xs">{x.d}</div>
          </div>
        ))}
      </div>
      <h3 className="pt-2 text-sm font-semibold text-foreground">Our principles</h3>
      <ul className="space-y-2">
        {[
          "Only publicly accessible content is supported.",
          "Media is never permanently stored - files are streamed and deleted.",
          "Privacy is the default, not an afterthought.",
          "A clean, ad-free experience on every device.",
        ].map((p) => (
          <li key={p} className="flex items-start gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-success" />
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

function PrivacyContent() {
  return (
    <article className="space-y-4 text-sm leading-relaxed text-muted-foreground">
      <p>
        This Privacy Policy explains how Pulliq handles your data when you use the
        service.
      </p>
      <Section title="What we collect">
        Pulliq does not require an account. We process the public URL you submit to
        fetch media on your behalf. We may log minimal, anonymized request metadata
        (such as timestamps and approximate request counts) for rate limiting and
        abuse prevention.
      </Section>
      <Section title="How media is processed">
        Media is fetched temporarily to analyze, transcode, or strip metadata, then
        streamed directly to you. We do not permanently store the media you download.
        Temporary working files are deleted shortly after your request completes.
      </Section>
      <Section title="Metadata">
        Pulliq inspects metadata to show you what is inside a file. When you choose to
        remove metadata, identifying fields (such as GPS, EXIF, camera, and software)
        are stripped before the file is delivered to you.
      </Section>
      <Section title="Third parties">
        We do not sell or share your data. Media requests are made directly to the
        source platform to retrieve publicly accessible content.
      </Section>
      <Section title="Your responsibility">
        You are responsible for ensuring you have the right to download and use the
        content you access, and for complying with applicable platform terms and
        copyright laws.
      </Section>
      <p className="pt-2 text-xs">Last updated: {new Date().getFullYear()}.</p>
    </article>
  );
}

function TermsContent() {
  return (
    <article className="space-y-4 text-sm leading-relaxed text-muted-foreground">
      <p>
        These Terms govern your use of Pulliq. By using the service, you agree to
        them.
      </p>
      <Section title="Permitted use">
        Pulliq is intended for downloading publicly accessible media for personal,
        lawful use. You may only download content you have the right to access and
        use.
      </Section>
      <Section title="Acceptable use">
        You agree not to use Pulliq to infringe copyrights, violate platform terms of
        service, distribute malware, circumvent technical protection measures, or
        access non-public content.
      </Section>
      <Section title="Intellectual property">
        All content accessed through Pulliq remains the property of its respective
        owners. Pulliq does not claim ownership of any media you download.
      </Section>
      <Section title="No warranty">
        The service is provided &quot;as is&quot; without warranties of any kind.
        Availability, accuracy, and compatibility with specific sources are not
        guaranteed.
      </Section>
      <Section title="Limitation of liability">
        To the maximum extent permitted by law, Pulliq is not liable for any damages
        arising from your use of the service.
      </Section>

      {/* Liability / Disclaimer */}
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.06] p-4">
        <div className="flex items-start gap-2.5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">
              Disclaimer &amp; Limitation of Liability
            </h3>
            <p className="text-xs leading-relaxed">
              Pulliq is provided &quot;as is&quot; for downloading publicly accessible
              media from supported platforms. Users are <strong>solely responsible</strong>{" "}
              for ensuring they have the legal right to download, use, and distribute any
              content accessed through this service.
            </p>
            <p className="text-xs leading-relaxed">
              Pulliq does not host, store, or claim ownership of any media. All content
              remains the property of its respective owners. The platform, its creators,
              and contributors are <strong>not responsible</strong> for any misuse,
              copyright infringement, or violation of applicable laws or platform terms of
              service committed by users.
            </p>
            <p className="text-xs leading-relaxed">
              By using Pulliq, you agree that you will only download publicly accessible
              content you have the right to access, that you will respect copyright laws,
              platform terms of service, and applicable regulations, and that the platform
              and its operators are not liable for any damages, legal action, or
              consequences arising from your use of the service.
            </p>
            <p className="text-xs leading-relaxed">
              If you believe your copyright has been infringed, please contact the
              respective hosting platform directly.
            </p>
          </div>
        </div>
      </div>

      <p className="pt-2 text-xs">Last updated: {new Date().getFullYear()}.</p>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold text-foreground">{title}</h3>
      <p>{children}</p>
    </div>
  );
}
