"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, AlertTriangle, RotateCcw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePulliqStore } from "@/store/pulliq-store";
import { useAnalyze } from "@/hooks/use-analyze";
import { isValidHttpUrl } from "@/lib/media/platform";
import { AnalyzeSkeleton } from "./analyze-skeleton";
import { AnalyzeResult } from "./analyze-result";
import {
  trackAnalyzeError,
  trackAnalyzeSuccess,
} from "@/lib/analytics";

export function AnalyzeView() {
  const { url, analyzing, result, error, setAnalyzing, setResult, setError, reset, startAnalyze } =
    usePulliqStore();
  // Run the query when on the analyze view and we don't yet have a result.
  const query = useAnalyze(url, analyzing || !result);

  // Sync query state into the store.
  React.useEffect(() => {
    if (query.isLoading) {
      setAnalyzing(true);
      return;
    }
    if (query.isError) {
      setAnalyzing(false);
      const msg =
        query.error instanceof Error ? query.error.message : "Something went wrong";
      setError(msg);
      trackAnalyzeError(msg);
      return;
    }
    if (query.isSuccess && query.data) {
      setAnalyzing(false);
      setResult(query.data);
      if (query.data.ok) {
        trackAnalyzeSuccess(query.data.platform, query.data.kind);
      }
    }
  }, [query.status, query.isLoading, query.isError, query.isSuccess, query.data, query.error, setAnalyzing, setError, setResult]);

  const showLoading = analyzing || (query.isLoading && !error);
  const showResult = !showLoading && (!!query.data || !!result);

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Top bar */}
      <div className="mb-5 flex items-center justify-between gap-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            reset();
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="-ml-2"
        >
          <ArrowLeft className="mr-1.5 h-4 w-4" /> New link
        </Button>

        <div className="flex items-center gap-2">
          {url && (
            <span className="hidden max-w-[280px] truncate text-xs text-muted-foreground sm:inline">
              {url}
            </span>
          )}
          {query.isError && (
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Retry
            </Button>
          )}
        </div>
      </div>

      <AnimatePresence mode="wait">
        {showLoading ? (
          <motion.div
            key="loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <AnalyzeSkeleton />
          </motion.div>
        ) : error && !query.data ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <ErrorState
              message={error}
              triedUrl={url}
              onRetry={() => query.refetch()}
              onReset={reset}
              onTryAnother={(u) => startAnalyze(u)}
            />
          </motion.div>
        ) : showResult ? (
          <motion.div
            key="result"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <AnalyzeResult />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ErrorState({
  message,
  triedUrl,
  onRetry,
  onReset,
  onTryAnother,
}: {
  message: string;
  triedUrl: string;
  onRetry: () => void;
  onReset: () => void;
  onTryAnother: (url: string) => void;
}) {
  const [value, setValue] = React.useState("");
  const valid = isValidHttpUrl(value);

  const submit = () => {
    if (valid) onTryAnother(value.trim());
  };

  return (
    <div className="mx-auto max-w-lg">
      <div className="flex flex-col items-center rounded-3xl border border-border/70 bg-card p-8 text-center sm:p-10">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600 dark:text-amber-400">
          <AlertTriangle className="h-7 w-7" />
        </div>
        <h2 className="mt-5 text-xl font-semibold tracking-tight">
          Couldn&apos;t access this link
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{message}</p>

        {triedUrl && (
          <p className="mt-4 max-w-full truncate rounded-lg bg-muted/60 px-3 py-1.5 text-xs text-muted-foreground">
            {triedUrl}
          </p>
        )}

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          <Button onClick={onRetry} variant="default">
            <RotateCcw className="mr-1.5 h-4 w-4" /> Try again
          </Button>
          <Button onClick={onReset} variant="outline">
            Start over
          </Button>
        </div>
      </div>

      {/* Quick try another link */}
      <div className="mt-4 rounded-2xl border border-border/70 bg-card p-4">
        <p className="mb-2.5 text-xs font-medium text-muted-foreground">
          Or try a different link
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            inputMode="url"
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            placeholder="Paste another public link"
            suppressHydrationWarning
            className="min-w-0 flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none transition-colors focus:border-primary/50 focus:ring-2 focus:ring-primary/10"
          />
          <Button onClick={submit} disabled={!valid} size="sm">
            <Search className="mr-1.5 h-3.5 w-3.5" /> Analyze
          </Button>
        </div>
      </div>
    </div>
  );
}
