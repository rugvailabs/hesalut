import Badge from "@/components/ui/Badge";
import { tFor, type Locale } from "@/lib/i18n";
import type { BusinessStatus } from "@/lib/types";

/**
 * Moderation status, colour-coded so a pending listing is obviously not live.
 *
 * Colour alone never carries the meaning - the label is always present - so
 * this stays readable to colour-blind users and in monochrome. The words
 * come from admin.status.<status>.label/hint.
 */
const STYLES: Record<BusinessStatus, string> = {
  pending: "bg-warning-bg text-warning ring-warning/30",
  approved: "bg-success-bg text-success ring-success/30",
  rejected: "bg-danger-bg text-danger ring-danger/30",
  suspended: "bg-line text-ink ring-line-strong",
};

export default function StatusBadge({
  status,
  showHint = false,
  locale,
}: {
  status: BusinessStatus;
  showHint?: boolean;
  locale: Locale;
}): JSX.Element {
  const t = tFor(locale);
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[status]}`}
      >
        {t(`admin.status.${status}.label`)}
      </span>
      {showHint ? (
        <span className="text-xs text-ink-subtle">{t(`admin.status.${status}.hint`)}</span>
      ) : null}
    </span>
  );
}

export { Badge };
