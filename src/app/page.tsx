"use client";

import * as React from "react";
import { SiteHeader } from "@/components/pulliq/site-header";
import { SiteFooter } from "@/components/pulliq/site-footer";
import { LandingView } from "@/components/pulliq/landing-view";
import { AnalyzeView } from "@/components/pulliq/analyze-view";
import { InfoDialog, type DocKind } from "@/components/pulliq/info-dialog";
import { ReactQueryProvider } from "@/components/pulliq/react-query-provider";
import { usePulliqStore } from "@/store/pulliq-store";
import { Toaster } from "@/components/ui/sonner";
import { toast } from "sonner";

export default function Home() {
  return (
    <ReactQueryProvider>
      <App />
    </ReactQueryProvider>
  );
}

function App() {
  const { view } = usePulliqStore();
  const [doc, setDoc] = React.useState<DocKind | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const openLegal = React.useCallback((d: DocKind) => {
    setDoc(d);
    setDialogOpen(true);
  }, []);

  // Toast when entering analyze view
  React.useEffect(() => {
    if (view === "analyze") {
      toast("Analyzing your link…", { duration: 1800 });
    }
  }, [view]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader onOpenLegal={openLegal} />

      <main className="flex-1">
        {view === "landing" ? <LandingView /> : <AnalyzeView />}
      </main>

      <SiteFooter onOpenLegal={openLegal} />

      <InfoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        doc={doc}
      />

      <Toaster position="bottom-center" />
    </div>
  );
}
