import * as React from "react";

/** Pulliq mark - a downward arrow entering a tray, representing download. */
export function PulliqMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="pulliq-g" x1="0" y1="0" x2="32" y2="32" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B82F6" />
          <stop offset="1" stopColor="#2563EB" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#pulliq-g)" />
      <path
        d="M16 7.5v11m0 0 4.2-4.2M16 18.5l-4.2-4.2"
        stroke="white"
        strokeWidth="2.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9 20.5v2.2A1.3 1.3 0 0 0 10.3 24h11.4A1.3 1.3 0 0 0 23 22.7v-2.2"
        stroke="white"
        strokeWidth="2.1"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function PulliqWordmark({ className }: { className?: string }) {
  return (
    <span className={className}>
      <span className="font-semibold tracking-tight">Pull</span>
      <span className="font-semibold tracking-tight text-primary">iq</span>
    </span>
  );
}
