/**
 * /login - the only unauthenticated entry point.
 *
 * Phone one-time-code sign-in used to lead this page, with email and password
 * folded away behind a <details>. That is reversed - removed, rather than
 * reordered: there is one way in, an email and a password, and the form is the
 * page. A mobile number is collected at sign-up as a contact detail.
 *
 * Two distinct cases arrive here, and conflating them causes a redirect loop:
 *
 *   - Signed out: render the form. `next` is carried on the form submit.
 *   - Signed in but refused (a non-admin who asked for /admin): middleware
 *     sends them here with ?forbidden=1. Honouring `next` would bounce them
 *     straight back to /admin, which bounces back here, forever. So we explain
 *     the refusal instead and never redirect to `next`.
 */

import Link from "next/link";
import { redirect } from "next/navigation";

import LoginForm from "@/components/LoginForm";
import LogoutButton from "@/components/LogoutButton";
import SiteFooter from "@/components/ds/SiteFooter";
import { Button, Card } from "@/components/ds/primitives";
import { getSession } from "@/lib/auth";
import { tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";


export default function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; forbidden?: string };
}): JSX.Element {
  const locale = getLocale();
  const t = tFor(locale);
  // Only accept internal paths - an open redirect otherwise.
  const raw = searchParams.next ?? "";
  const next = raw.startsWith("/") && !raw.startsWith("//") ? raw : "";
  const forbidden = searchParams.forbidden === "1";
  // /dashboard is refused to customers; /admin to everyone but staff. They need
  // different ways out.
  const forOwners = next === "/dashboard" || next.startsWith("/dashboard/");

  const session = getSession();

  if (session !== null) {
    // Signed in and allowed: nothing to do here.
    if (!forbidden) redirect(next || "/");

    // Signed in but not permitted. Dead end by design - no `next` redirect.
    return (
      <>
        <main className="mx-auto max-w-md px-4 py-section sm:px-6">
          <Card className="p-6">
            <h1 className="text-page-title text-ink">
              {forOwners ? t("auth.forbidden.ownersTitle") : t("auth.forbidden.title")}
            </h1>
            <p className="mt-2 text-body text-ink-muted">
              {forOwners ? (
                <>{t("auth.forbidden.ownersBody")}</>
              ) : (
                <>
                  {t("auth.forbidden.bodyBefore")}{" "}
                  <code className="rounded-sm bg-surface-muted px-1 text-ink">
                    {next || t("auth.forbidden.thatPage")}
                  </code>
                  {t("auth.forbidden.bodyAfter")}
                </>
              )}
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-2">
              {forOwners ? (
                <Button asChild>
                  <Link href="/register">{t("auth.forbidden.registerBusiness")}</Link>
                </Button>
              ) : null}
              <Button asChild variant={forOwners ? "secondary" : "primary"}>
                <Link href="/">{t("auth.forbidden.home")}</Link>
              </Button>
              <LogoutButton locale={locale} />
            </div>
          </Card>
        </main>

        <SiteFooter locale={locale} />
      </>
    );
  }

  return (
    <>

      <main className="mx-auto max-w-md px-4 py-section sm:px-6">
        <h1 className="text-page-title text-ink">{t("auth.title")}</h1>
        <p className="mt-1 text-body text-ink-muted">{t("auth.intro")}</p>

        <Card className="mt-6 p-6">
          <LoginForm next={next} locale={locale} />
        </Card>
      </main>

      <SiteFooter locale={locale} />
    </>
  );
}
