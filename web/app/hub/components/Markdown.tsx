"use client";

// Ultra-light markdown renderer for the committed section files (medications.md,
// problems.md, allergies.md) and the care plan. Handles only what those files
// use: # / ## headings, "- " bullets, _italic_ placeholders, blank lines. No
// external deps; keeps the bundle tiny and the output safe (plain text nodes).

import { Fragment } from "react";

export function Markdown({ text }: { text: string }) {
  const lines = (text || "").replace(/\r\n/g, "\n").split("\n");
  const blocks: React.ReactNode[] = [];
  let bullets: string[] = [];

  const flushBullets = (key: string) => {
    if (bullets.length === 0) return;
    blocks.push(
      <ul key={key} className="my-1 list-disc space-y-0.5 pl-5 text-sm text-gray-700">
        {bullets.map((b, i) => (
          <li key={i}>{inline(b)}</li>
        ))}
      </ul>,
    );
    bullets = [];
  };

  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    if (line.startsWith("- ")) {
      bullets.push(line.slice(2));
      return;
    }
    flushBullets(`ul-${idx}`);
    if (line.startsWith("## ")) {
      blocks.push(
        <h4 key={idx} className="mt-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
          {line.slice(3)}
        </h4>,
      );
    } else if (line.startsWith("# ")) {
      blocks.push(
        <h3 key={idx} className="text-sm font-semibold text-gray-900">
          {line.slice(2)}
        </h3>,
      );
    } else if (line.trim() === "") {
      // skip blank lines (spacing handled by margins)
    } else {
      blocks.push(
        <p key={idx} className="text-sm text-gray-700">
          {inline(line)}
        </p>,
      );
    }
  });
  flushBullets("ul-end");

  return <div className="space-y-1">{blocks}</div>;
}

// Minimal inline handling: _italic_ for the "_none recorded_" placeholder.
function inline(text: string): React.ReactNode {
  const parts = text.split(/(_[^_]+_)/g);
  return parts.map((p, i) =>
    p.startsWith("_") && p.endsWith("_") && p.length > 2 ? (
      <em key={i} className="text-gray-400">
        {p.slice(1, -1)}
      </em>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}
