"use client";

import { useState } from "react";

/** A link plus a copy control; falls back to plain selectable text when the clipboard is unavailable. */
export function CopyLink({ label, url }: { label: string; url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <label>{label}</label>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-rule bg-paper px-3 py-2 font-mono text-xs text-ink">
          {url}
        </code>
        <button
          type="button"
          onClick={copy}
          className="rounded-md border border-rule px-3 py-2 text-xs uppercase tracking-[0.08em] text-umber transition-colors duration-200 hover:border-rule-strong hover:text-maroon"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
