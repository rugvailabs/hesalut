import type { ReactNode } from "react";

/** Surface container: white panel, hairline border, subtle lift on hover. */
export default function Card({
  children,
  className = "",
  interactive = false,
}: {
  children: ReactNode;
  className?: string;
  /** Adds hover affordance. Use when the whole card is a link. */
  interactive?: boolean;
}): JSX.Element {
  return (
    <div
      className={[
        "rounded-lg border border-line bg-surface p-4 shadow-sm",
        interactive ? "transition hover:border-line-strong hover:shadow-md" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </div>
  );
}
