"use client";

// Copy-to-clipboard button with a brief "Copied!" confirmation. Used for share
// links and the safety call script.

import { useState } from "react";

export function CopyButton({ text, label = "Copy", className = "" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // Fallback for older/non-secure contexts.
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* ignore */
      }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button
      onClick={copy}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-teal-700 transition hover:bg-teal-50 ${className}`}
    >
      {copied ? (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Copied!
        </>
      ) : (
        <>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden>
            <rect x="9" y="9" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
            <path d="M5 15V5a2 2 0 0 1 2-2h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          {label}
        </>
      )}
    </button>
  );
}
