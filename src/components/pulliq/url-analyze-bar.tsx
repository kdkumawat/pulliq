"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ClipboardPaste, Loader2, Link2, Sparkles, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { isValidHttpUrl, detectPlatform, getPlatformInfo } from "@/lib/media/platform";
import { usePulliqStore } from "@/store/pulliq-store";
import { PlatformIcon } from "./platform-icon";

export function UrlAnalyzeBar({
  size = "lg",
  autoFocus,
  onAnalyzed,
}: {
  size?: "lg" | "md";
  autoFocus?: boolean;
  onAnalyzed?: () => void;
}) {
  const { startAnalyze, analyzing } = usePulliqStore();
  const [value, setValue] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  const trimmed = value.trim();
  const hasInput = trimmed.length > 0;
  // Require either an explicit http(s):// prefix OR a dot in the host portion,
  // so bare words like "notvalid" don't pass as URLs after normalization.
  const looksLikeUrl =
    /^https?:\/\//i.test(trimmed) || /^[^\s/]+\.[^\s/]+/.test(trimmed);
  const valid = looksLikeUrl && isValidHttpUrl(trimmed);
  const platform = valid ? detectPlatform(trimmed) : "unknown";
  const platformInfo = platform !== "unknown" ? getPlatformInfo(platform) : undefined;
  // Show error only after user has typed something (touched or has input).
  const showError = hasInput && !valid;

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setValue(text.trim());
        setTouched(true);
      }
    } catch {
      inputRef.current?.focus();
    }
  };

  const submit = () => {
    setTouched(true);
    if (!valid) {
      inputRef.current?.focus();
      return;
    }
    startAnalyze(trimmed);
    onAnalyzed?.();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="w-full">
      <motion.div
        layout
        className={cn(
          "group relative flex items-center gap-2 rounded-2xl border bg-card p-2 shadow-sm transition-all duration-300",
          showError
            ? "border-destructive/60 ring-2 ring-destructive/15"
            : valid
              ? "border-primary/50 ring-4 ring-primary/10"
              : "border-border focus-within:border-primary/50 focus-within:ring-4 focus-within:ring-primary/10"
        )}
      >
        {/* Platform indicator */}
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-muted/60">
          <AnimatePresence mode="wait">
            {platformInfo ? (
              <motion.div
                key={platformInfo.id}
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <PlatformIcon platform={platformInfo.id} className="h-6 w-6" />
              </motion.div>
            ) : (
              <motion.div
                key="link"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <Link2 className="h-5 w-5 text-muted-foreground" />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <input
          ref={inputRef}
          type="text"
          inputMode="url"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => setTouched(true)}
          placeholder="Paste a public social media link"
          suppressHydrationWarning
          className={cn(
            "min-w-0 flex-1 bg-transparent px-1 text-foreground outline-none placeholder:text-muted-foreground/70",
            size === "lg" ? "h-11 text-base" : "h-9 text-sm"
          )}
        />

        {value.length === 0 && (
          <button
            type="button"
            onClick={handlePaste}
            className="hidden shrink-0 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:inline-flex"
          >
            <ClipboardPaste className="h-3.5 w-3.5" /> Paste
          </button>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!valid || analyzing}
          className={cn(
            "inline-flex shrink-0 items-center gap-2 rounded-xl px-4 font-semibold shadow-sm transition-all active:scale-[0.98]",
            valid && !analyzing
              ? "bg-primary text-primary-foreground hover:bg-primary/90"
              : "cursor-not-allowed bg-muted text-muted-foreground",
            size === "lg" ? "h-11 text-sm" : "h-9 text-sm"
          )}
        >
          {analyzing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Analyzing
            </>
          ) : (
            <>
              Analyze <ArrowRight className="h-4 w-4" />
            </>
          )}
        </button>
      </motion.div>

      <div className="mt-2.5 flex min-h-[20px] items-center gap-2 px-1">
        <AnimatePresence mode="wait">
          {showError ? (
            <motion.p
              key="err"
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-destructive"
            >
              <AlertCircle className="h-3.5 w-3.5" /> Enter a valid link (e.g. https://youtube.com/...)
            </motion.p>
          ) : platformInfo ? (
            <motion.p
              key="detected"
              initial={{ opacity: 0, y: -2 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground"
            >
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              Detected: <span className="text-foreground">{platformInfo.name}</span>
            </motion.p>
          ) : (
            <motion.p
              key="hint"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-xs text-muted-foreground"
            >
              Platform is detected automatically. No dropdown needed.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
