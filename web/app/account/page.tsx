/**
 * /account - the signed-in user's own profile.
 *
 * Read-only facts (email, role, member since) sit apart from the editable
 * form, so it is obvious which parts of an account a user can change
 * themselves and which are the system's to set.
 */

import ProfileForm from "@/components/ProfileForm";
import Card from "@/components/ui/Card";
import { getProfile } from "@/lib/api";
import { requireUser } from "@/lib/auth";
import { INTL_LOCALE, tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";
import type { UserRole } from "@/lib/types";

export const dynamic = "force-dynamic";

/** Roles with a label under dashboard.account.roles; anything else shows raw. */
const ROLES: UserRole[] = ["customer", "business_owner", "admin"];

export default async function AccountPage(): Promise<JSX.Element> {
  const locale = getLocale();
  const t = tFor(locale);
  await requireUser("/account");
  // Read through /profile rather than reusing the session lookup, so the page
  // shows what the server currently holds after an edit.
  const user = await getProfile();

  const memberSince = new Date(user.created_at);

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">

      <h1 className="text-2xl font-bold tracking-tight text-ink">
        {t("dashboard.account.title")}
      </h1>
      <p className="mt-1 mb-6 text-sm text-ink-muted">
        {t("dashboard.account.subtitle")}
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="sm:col-span-2">
          <h2 className="mb-3 font-semibold text-ink">
            {t("dashboard.account.details")}
          </h2>
          <ProfileForm user={user} locale={locale} />
        </Card>

        <Card>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-subtle">
            {t("dashboard.account.account")}
          </h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="font-medium text-ink">
                {t("dashboard.account.email")}
              </dt>
              <dd className="break-words text-ink-muted">{user.email}</dd>
              <dd className="mt-0.5 text-xs text-ink-subtle">
                {t("dashboard.account.emailHint")}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">
                {t("dashboard.account.role")}
              </dt>
              <dd className="text-ink-muted">
                {ROLES.includes(user.role)
                  ? t(`dashboard.account.roles.${user.role}`)
                  : user.role}
              </dd>
            </div>
            <div>
              <dt className="font-medium text-ink">
                {t("dashboard.account.memberSince")}
              </dt>
              <dd className="text-ink-muted">
                {Number.isNaN(memberSince.getTime())
                  ? user.created_at
                  : memberSince.toLocaleDateString(INTL_LOCALE[locale], {
                      year: "numeric",
                      month: "long",
                      day: "numeric",
                    })}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </div>
  );
}
