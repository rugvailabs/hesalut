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
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
  suspended: "bg-slate-200 text-slate-700 ring-slate-300",
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
        <span className="text-xs text-slate-500">{t(`admin.status.${status}.hint`)}</span>
      ) : null}
    </span>
  );
}

export { Badge };
