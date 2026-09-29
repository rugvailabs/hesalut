import { tFor, type Locale } from "@/lib/i18n";
import type { VerificationStatus } from "@/lib/types";

/**
 * KYC status, shown next to the moderation status rather than merged with it.
 *
 * They are two decisions and an owner has to be able to tell which one is
 * holding their listing back - "Live" beside "Verification pending" is the
 * honest picture, and one combined badge would hide half of it.
 *
 * `null` means nothing has been submitted, which is a different state from
 * pending and gets different words (admin.kyc.<status>.label/hint).
 */
const STYLES: Record<VerificationStatus | "none", string> = {
  none: "bg-slate-100 text-slate-700 ring-slate-300",
  pending: "bg-amber-50 text-amber-800 ring-amber-200",
  verified: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  rejected: "bg-red-50 text-red-700 ring-red-200",
};

export default function VerificationBadge({
  status,
  showHint = false,
  locale,
}: {
  status: VerificationStatus | null;
  showHint?: boolean;
  locale: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const key = status ?? "none";
  return (
    <span className="inline-flex items-center gap-2">
      <span
        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${STYLES[key]}`}
      >
        {t(`admin.kyc.${key}.label`)}
      </span>
      {showHint ? (
        <span className="text-xs text-slate-500">{t(`admin.kyc.${key}.hint`)}</span>
      ) : null}
    </span>
  );
}
