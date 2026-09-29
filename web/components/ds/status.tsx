/**
 * The two decisions that gate a listing, as badges.
 *
 * They are deliberately separate components rather than one merged "state",
 * because they are two independent decisions and an owner has to be able to
 * tell which one is holding their listing back. "Live" beside "Verification
 * pending" is the honest picture; a single combined badge would hide half of
 * it, and the half it hides is the half the owner can act on.
 *
 * Colour never carries the meaning on its own - the label is always present -
 * so both stay readable in monochrome and to a colour-blind reader. The hint
 * is the sentence that turns a status into something actionable, and is opt-in
 * because a list of ten listings does not want ten hints.
 */

import { Badge, type BadgeProps } from "@/components/ds/primitives";
import { cn } from "@/lib/cn";
import { tFor, type Locale } from "@/lib/i18n";
import type { BusinessStatus, VerificationStatus } from "@/lib/types";

type Tone = NonNullable<BadgeProps["tone"]>;

/** `label` and `hint` are dictionary keys, resolved per call. */
const LISTING: Record<
  BusinessStatus,
  { label: string; tone: Tone; hint: string }
> = {
  pending: {
    label: "discover.status.pendingLabel",
    tone: "warning",
    hint: "discover.status.pendingHint",
  },
  approved: {
    label: "discover.status.approvedLabel",
    tone: "success",
    hint: "discover.status.approvedHint",
  },
  rejected: {
    label: "discover.status.rejectedLabel",
    tone: "danger",
    hint: "discover.status.rejectedHint",
  },
  suspended: {
    label: "discover.status.suspendedLabel",
    tone: "neutral",
    hint: "discover.status.suspendedHint",
  },
};

/** `null` is "nothing submitted", which is not the same as pending. */
const KYC: Record<
  VerificationStatus | "none",
  { label: string; tone: Tone; hint: string }
> = {
  none: {
    label: "discover.status.kycNoneLabel",
    tone: "neutral",
    hint: "discover.status.kycNoneHint",
  },
  pending: {
    label: "discover.status.kycPendingLabel",
    tone: "warning",
    hint: "discover.status.kycPendingHint",
  },
  verified: {
    label: "discover.status.kycVerifiedLabel",
    tone: "verified",
    hint: "discover.status.kycVerifiedHint",
  },
  rejected: {
    label: "discover.status.kycRejectedLabel",
    tone: "danger",
    hint: "discover.status.kycRejectedHint",
  },
};

function StatusPair({
  label,
  tone,
  hint,
  showHint,
  className,
}: {
  label: string;
  tone: Tone;
  hint: string;
  showHint: boolean;
  className?: string;
}): JSX.Element {
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-2", className)}>
      <Badge tone={tone}>{label}</Badge>
      {showHint ? <span className="text-meta text-ink-subtle">{hint}</span> : null}
    </span>
  );
}

/** Moderation status: has a human approved the listing's content? */
export function ListingStatusBadge({
  status,
  showHint = false,
  locale = "en",
  className,
}: {
  status: BusinessStatus;
  showHint?: boolean;
  locale?: Locale;
  className?: string;
}): JSX.Element {
  const t = tFor(locale);
  const style = LISTING[status];
  return (
    <StatusPair
      label={t(style.label)}
      tone={style.tone}
      hint={t(style.hint)}
      showHint={showHint}
      className={className}
    />
  );
}

/** KYC status: has the business behind the listing been proven real? */
export function KycBadge({
  status,
  showHint = false,
  locale = "en",
  className,
}: {
  status: VerificationStatus | null;
  showHint?: boolean;
  locale?: Locale;
  className?: string;
}): JSX.Element {
  const t = tFor(locale);
  const style = KYC[status ?? "none"];
  return (
    <StatusPair
      label={t(style.label)}
      tone={style.tone}
      hint={t(style.hint)}
      showHint={showHint}
      className={className}
    />
  );
}

/**
 * Why a listing is not in public search, in one sentence, or null when it is.
 *
 * Both gates have to pass and the owner's question is always "which one is
 * stopping me" - so this reads the pair together rather than making the page
 * re-derive it. Returning null for the live case lets a caller render nothing
 * without repeating the condition.
 */
export function visibilityBlocker(
  status: BusinessStatus,
  kyc: VerificationStatus | null,
  locale: Locale = "en",
): string | null {
  if (status === "approved" && kyc === "verified") return null;
  const t = tFor(locale);

  if (status !== "approved") {
    return t(LISTING[status].hint);
  }
  // Approved but invisible is the confusing case the owner most often hits.
  if (kyc === "pending") {
    return t("discover.status.blockerKycPending");
  }
  if (kyc === "rejected") {
    return t("discover.status.blockerKycRejected");
  }
  return t("discover.status.blockerUnverified");
}
