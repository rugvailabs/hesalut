/**
 * Step 3: registration complete.
 *
 * By now the account is active and the listing exists, pending review. There is
 * no plan and no receipt: payment comes after verification. This says what has
 * to happen, in order, because "registered" is not "live" - a listing appears
 * in search once a moderator has approved it and the business has passed
 * verification - and "verified" is what opens the plan choice.
 */

import Link from "next/link";
import { CheckCircle2 } from "lucide-react";

import { ListingStatusBadge } from "@/components/ds/status";
import { Button, Card } from "@/components/ds/primitives";
import { tFor, type Locale } from "@/lib/i18n";
import type { RegistrationState } from "@/lib/types";

export default function CompleteStep({
  state,
  locale,
}: {
  state: RegistrationState;
  locale: Locale;
}): JSX.Element {
  const t = tFor(locale);
  const { business, account } = state;

  // An owner from before registration existed: nothing to summarise.
  if (business === null) {
    return (
      <Card className="p-6">
        <h2 className="text-card-title text-ink">{t("register.complete.alreadyTitle")}</h2>
        <p className="mt-1 text-body text-ink-muted">{t("register.complete.alreadyBody")}</p>
        <Button asChild className="mt-4">
          <Link href="/dashboard">{t("register.complete.goDashboard")}</Link>
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card className="flex items-start gap-3 border-success/30 bg-success-bg p-5">
        <CheckCircle2 className="mt-0.5 size-6 shrink-0 text-success" aria-hidden="true" />
        <div>
          <h2 className="text-card-title text-ink">{t("register.complete.title")}</h2>
          <p className="mt-1 text-body text-ink-muted">
            {t("register.complete.body", { business: business.name, email: account.email })}
          </p>
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="text-card-title text-ink">{t("register.complete.yourListing")}</h3>
        <p className="text-body text-ink">{business.name}</p>
        <ListingStatusBadge locale={locale} status={business.status} showHint />
      </Card>

      <Card className="space-y-3 p-5">
        <h3 className="text-card-title text-ink">{t("register.complete.beforeSearch")}</h3>
        <ol className="list-decimal space-y-2 pl-5 text-body text-ink-muted">
          <li>
            <span className="text-ink">{t("register.complete.verifyTitle")}</span>{" "}
            {t("register.complete.verifyBody")}
          </li>
          <li>
            <span className="text-ink">{t("register.complete.reviewTitle")}</span>{" "}
            {t("register.complete.reviewBody")}
          </li>
          <li>
            <span className="text-ink">{t("register.complete.planTitle")}</span>{" "}
            {t("register.complete.planBody")}
          </li>
          <li>
            <span className="text-ink">{t("register.complete.profileTitle")}</span>{" "}
            {t("register.complete.profileBody")}
          </li>
        </ol>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button asChild>
            <Link href={`/dashboard/${business.id}/verification`}>{t("register.complete.verifyButton")}</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href={`/dashboard/${business.id}/edit`}>{t("register.complete.profileButton")}</Link>
          </Button>
          <Button asChild variant="ghost">
            <Link href="/dashboard">{t("register.complete.goDashboard")}</Link>
          </Button>
        </div>
      </Card>
    </div>
  );
}
