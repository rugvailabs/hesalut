import type { ReactNode } from "react";

import { tFor, type Locale } from "@/lib/i18n";

/**
 * One banner for every "something went wrong" or "that worked".
 *
 * Replaces eight near-identical inline blocks. Deliberately a banner rather
 * than a toast: a toast that disappears takes the explanation with it, and
 * these messages are usually attached to a form the person is still looking
 * at. An error also needs to survive long enough to be read and acted on.
 *
 * `tone` carries meaning in the text and the icon as well as the colour, so
 * it does not depend on colour alone.
 */

type Tone = "error" | "warning" | "success" | "info";

const TONES: Record<Tone, { className: string; icon: string; label: string }> = {
  error: {
    className: "border-danger/30 bg-danger-bg text-danger",
    icon: "!",
    label: "discover.feedback.error",
  },
  warning: {
    className: "border-warning/30 bg-warning-bg text-warning",
    icon: "!",
    label: "discover.feedback.warning",
  },
  success: {
    className: "border-success/30 bg-success-bg text-success",
    icon: "✓",
    label: "discover.feedback.success",
  },
  info: {
    className: "border-line bg-surface-muted text-ink",
    icon: "i",
    label: "discover.feedback.note",
  },
};

export default function Alert({
  tone = "error",
  title,
  children,
  className = "",
  locale = "en",
}: {
  tone?: Tone;
  title?: string;
  children: ReactNode;
  className?: string;
  /** Language of the screen-reader tone prefix ("Error:", "Note:"). */
  locale?: Locale;
}): JSX.Element {
  const style = TONES[tone];
  return (
    <div
      // Errors interrupt; everything else is announced politely.
      role={tone === "error" ? "alert" : "status"}
      className={`flex gap-2.5 rounded-md border px-3 py-2.5 text-sm ${style.className} ${className}`.trim()}
    >
      <span
        aria-hidden="true"
        className="mt-0.5 flex h-4 w-4 flex-none items-center justify-center rounded-full border border-current text-[10px] font-bold"
      >
        {style.icon}
      </span>
      <div className="min-w-0">
        <span className="sr-only">{tFor(locale)(style.label)}{locale === "fr" ? "\u202f: " : ": "}</span>
        {title !== undefined ? <p className="font-semibold">{title}</p> : null}
        <div className={title !== undefined ? "mt-0.5" : undefined}>{children}</div>
      </div>
    </div>
  );
}
