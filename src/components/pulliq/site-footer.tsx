"use client";

import * as React from "react";
import Link from "next/link";
import { Github, Heart } from "lucide-react";
import { PulliqMark, PulliqWordmark } from "./brand";
import { usePulliqStore } from "@/store/pulliq-store";

interface FooterProps {
  onOpenLegal: (doc: "about" | "privacy" | "terms") => void;
}

export function SiteFooter({ onOpenLegal }: FooterProps) {
  const { setView } = usePulliqStore();

  const goHome = () => {
    setView("landing");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollToSection = (id: string) => {
    setView("landing");
    setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }), 80);
  };

  return (
    <footer className="mt-auto border-t border-border/70 bg-background/50">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:py-16">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Brand */}
          <div className="max-w-xs">
            <button onClick={goHome} className="flex items-center gap-2.5" aria-label="Pulliq home">
              <PulliqMark className="h-8 w-8" />
              <PulliqWordmark className="text-[19px]" />
            </button>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Download publicly accessible media from social links. Inspect its
              metadata. Save a privacy-clean copy.
            </p>
            <p className="mt-4 text-sm font-medium text-foreground">
              Download. Inspect. Clean.
            </p>
          </div>

          {/* Product */}
          <FooterCol title="Product">
            <FooterLink onClick={() => onOpenLegal("about")}>About</FooterLink>
            <FooterLink onClick={() => scrollToSection("features")}>Features</FooterLink>
            <FooterLink onClick={() => scrollToSection("how")}>How it works</FooterLink>
            <FooterLink onClick={() => scrollToSection("faq")}>FAQ</FooterLink>
          </FooterCol>

          {/* Legal */}
          <FooterCol title="Legal">
            <FooterLink onClick={() => onOpenLegal("privacy")}>Privacy Policy</FooterLink>
            <FooterLink onClick={() => onOpenLegal("terms")}>Terms of Service</FooterLink>
            <FooterLink onClick={() => onOpenLegal("about")}>About Pulliq</FooterLink>
          </FooterCol>

          {/* Resources */}
          <FooterCol title="Resources">
            <FooterLink onClick={() => scrollToSection("platforms")}>Platforms</FooterLink>
            <Link
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              GitHub
            </Link>
          </FooterCol>
        </div>

        <div className="mt-10 border-t border-border/60 pt-6">
          <p className="text-xs leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground/80">Disclaimer:</span>{" "}
            Pulliq is for downloading publicly accessible content only. Users are
            solely responsible for respecting copyright laws and platform terms of
            service. The platform is not responsible for any misuse or legal
            violations.
          </p>
        </div>

        <div className="mt-6 flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Pulliq. For publicly accessible content only.
          </p>
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              Built with <Heart className="h-3.5 w-3.5 fill-primary text-primary" /> for privacy
            </span>
            <Link
              href="https://github.com"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
            >
              <Github className="h-3.5 w-3.5" /> GitHub
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <ul className="mt-4 space-y-2.5">{children}</ul>
    </div>
  );
}

function FooterLink({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <li>
      <button
        onClick={onClick}
        className="text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        {children}
      </button>
    </li>
  );
}
