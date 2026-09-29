import type { ReactNode } from "react";

type Tone = "neutral" | "success" | "info";

const TONES: Record<Tone, string> = {
  neutral: "bg-surface-muted text-ink ring-line",
  success: "bg-success-bg text-success ring-success/30",
  info: "bg-brand-50 text-brand-700 ring-brand-200",
};

export default function Badge({
  children,
  tone = "neutral",
  className = "",
}: {
  children: ReactNode;
  tone?: Tone;
  className?: string;
}): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${TONES[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
