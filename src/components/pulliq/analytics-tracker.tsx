"use client";

import * as React from "react";
import { usePulliqStore } from "@/store/pulliq-store";
import { trackScreen } from "@/lib/analytics";

/** Fires GA screen_view when the user switches landing / analyze. */
export function AnalyticsTracker() {
  const { view } = usePulliqStore();

  React.useEffect(() => {
    trackScreen(view);
  }, [view]);

  return null;
}
