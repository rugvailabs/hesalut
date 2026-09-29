"use client";

import { Heart } from "lucide-react";

import { useExploreT } from "@/components/explore/ExploreProviders";
import { cn } from "@/lib/cn";

export default function FavoriteButton({
  saved,
  name,
  onToggle,
  className,
}: {
  saved: boolean;
  name: string;
  onToggle: () => void;
  className?: string;
}): JSX.Element {
  const { t } = useExploreT();
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={saved}
      aria-label={saved ? t("card.unsave", { name }) : t("card.save", { name })}
      title={saved ? t("card.savedHint") : t("card.saveHint")}
      className={cn(
        "inline-flex size-9 shrink-0 items-center justify-center rounded-pill border transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        saved
          ? "border-danger/30 bg-danger-bg text-danger"
          : "border-line bg-surface text-ink-muted hover:border-line-strong hover:text-ink",
        className,
      )}
    >
      <Heart className={cn("size-4", saved && "fill-current")} aria-hidden="true" />
    </button>
  );
}
