"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Moon, Sun, Laptop, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PulliqMark, PulliqWordmark } from "./brand";
import { usePulliqStore } from "@/store/pulliq-store";
import { cn } from "@/lib/utils";

interface HeaderProps {
  onOpenLegal: (doc: "about" | "privacy" | "terms") => void;
}

type ThemeMode = "light" | "dark" | "system";
const THEME_CYCLE: ThemeMode[] = ["light", "dark", "system"];
const THEME_META: Record<ThemeMode, { icon: React.ElementType; label: string }> = {
  light: { icon: Sun, label: "Light" },
  dark: { icon: Moon, label: "Dark" },
  system: { icon: Laptop, label: "System" },
};

export function SiteHeader({ onOpenLegal }: HeaderProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const { view, setView } = usePulliqStore();

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Cycle: light -> dark -> system -> light.
  const toggleTheme = () => {
    const current = (theme as ThemeMode) || "system";
    const idx = THEME_CYCLE.indexOf(current);
    const next = THEME_CYCLE[(idx + 1) % THEME_CYCLE.length];
    setTheme(next);
  };

  const goHome = () => {
    setView("landing");
    setMobileOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const scrollTo = (id: string) => {
    setMobileOpen(false);
    if (view !== "landing") {
      setView("landing");
      setTimeout(() => {
        document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
      }, 120);
    } else {
      document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
    }
  };

  const currentMode: ThemeMode = mounted ? ((theme as ThemeMode) || "system") : "system";
  const ThemeIcon = THEME_META[currentMode].icon;
  const isDark = mounted && resolvedTheme === "dark";

  return (
    <header
      className={cn(
        "sticky top-0 z-50 w-full transition-all duration-300",
        scrolled
          ? "border-b border-border/70 bg-background/80 backdrop-blur-xl supports-[backdrop-filter]:bg-background/60"
          : "border-b border-transparent bg-background/0"
      )}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        {/* Left: brand */}
        <button
          onClick={goHome}
          className="group flex items-center gap-2.5"
          aria-label="Pulliq home"
        >
          <PulliqMark className="h-8 w-8 transition-transform duration-300 group-hover:scale-105" />
          <PulliqWordmark className="text-[19px]" />
        </button>

        {/* Center: nav (desktop) */}
        <nav className="hidden items-center gap-1 md:flex">
          <NavButton onClick={() => scrollTo("platforms")}>Platforms</NavButton>
          <NavButton onClick={() => scrollTo("features")}>Features</NavButton>
          <NavButton onClick={() => scrollTo("how")}>How it works</NavButton>
          <NavButton onClick={() => scrollTo("faq")}>FAQ</NavButton>
        </nav>

        {/* Right: actions */}
        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => onOpenLegal("about")}
          >
            About
          </Button>

          {/* Theme toggle - cycles: light -> dark -> system -> light */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9"
            onClick={toggleTheme}
            aria-label={`Theme: ${THEME_META[currentMode].label}. Click to change`}
            title={`Theme: ${THEME_META[currentMode].label}`}
          >
            {mounted ? (
              <ThemeIcon className="h-[18px] w-[18px]" />
            ) : (
              <Laptop className="h-[18px] w-[18px]" />
            )}
          </Button>

          {/* Mobile menu */}
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 md:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/70 bg-background/95 backdrop-blur-xl">
          <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-3 sm:px-6">
            <MobileNavButton onClick={() => scrollTo("platforms")}>Platforms</MobileNavButton>
            <MobileNavButton onClick={() => scrollTo("features")}>Features</MobileNavButton>
            <MobileNavButton onClick={() => scrollTo("how")}>How it works</MobileNavButton>
            <MobileNavButton onClick={() => scrollTo("faq")}>FAQ</MobileNavButton>
            <div className="my-1 h-px bg-border" />
            <MobileNavButton onClick={() => { setMobileOpen(false); onOpenLegal("about"); }}>About</MobileNavButton>
            <MobileNavButton onClick={() => { setMobileOpen(false); onOpenLegal("privacy"); }}>Privacy</MobileNavButton>
            <MobileNavButton onClick={() => { setMobileOpen(false); onOpenLegal("terms"); }}>Terms</MobileNavButton>
          </div>
        </div>
      )}
    </header>
  );
}

function NavButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-full px-3.5 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      {children}
    </button>
  );
}

function MobileNavButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground/90 transition-colors hover:bg-accent"
    >
      {children}
    </button>
  );
}
