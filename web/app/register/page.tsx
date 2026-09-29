/**
 * /register - business registration in four steps.
 *
 *   1. Your details  - account, business, category, location
 *   2. Choose a plan - mandatory; saved the moment "Select" is clicked
 *   3. Payment       - order summary with GST/HST, terms, card (free: terms only)
 *   4. Done          - account activated, listing + subscription + receipt created
 *
 * Progress is saved server-side at every step (GET /registration), so a
 * refresh, a closed browser or another device resumes where the owner left
 * off. `?step=` moves between steps already reached - back to change details
 * or the plan, forward again - but never past the furthest one saved, so a
 * hand-typed ?step=3 cannot skip choosing a plan and nothing can skip payment.
 *
 * Customers keep the one-step sign-up on /login. A customer who is already
 * signed in registers their business on that same account (step 1 converts it)
 * rather than being asked to sign out and start a second one.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import CompleteStep from "@/components/register/CompleteStep";
import DetailsStep from "@/components/register/DetailsStep";
import PaymentStep from "@/components/register/PaymentStep";
import PlanStep from "@/components/register/PlanStep";
import RegistrationSteps from "@/components/register/RegistrationSteps";
import LogoutButton from "@/components/LogoutButton";
import SiteFooter from "@/components/ds/SiteFooter";
import { Button, Card } from "@/components/ds/primitives";
import { getCategories, getPlans, getRegistration } from "@/lib/api";
import { getCurrentUser } from "@/lib/auth";
import { tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = tFor(getLocale());
  return {
    title: t("register.meta.title"),
    description: t("register.meta.description"),
  };
}

/** The dictionary key under register.headings for each step. */
const HEADINGS: Record<number, string> = {
  1: "details",
  2: "plan",
  3: "payment",
  4: "done",
};

export default async function RegisterPage({
  searchParams,
}: {
  /** `resume=1` comes from signing in: a finished registration goes to the dashboard. */
  searchParams: { step?: string; resume?: string };
}): Promise<JSX.Element> {
  const locale = getLocale();
  const t = tFor(locale);
  const user = await getCurrentUser();

  // Signed out: step 1, creating the account.
  if (user === null) {
    const categories = await getCategories();
    return (
      <Layout current={1} furthest={1} completed={false}>
        <DetailsStep categories={categories} existing={null} locale={locale} />
      </Layout>
    );
  }

  // A customer registers the business on their own account.
  if (user.role === "customer" && !user.is_admin) {
    const categories = await getCategories();
    return (
      <Layout current={1} furthest={1} completed={false}>
        <DetailsStep
          categories={categories}
          existing={{
            account: { name: user.name, email: user.email, phone: user.phone },
            details: null,
          }}
          convert
          locale={locale}
        />
      </Layout>
    );
  }

  // Staff accounts do not own businesses.
  if (user.role !== "business_owner") {
    return (
      <Shell>
        <Card className="mx-auto max-w-lg p-6">
          <h1 className="text-page-title text-ink">{t("register.staff.title")}</h1>
          <p className="mt-2 text-body text-ink-muted">
            {t("register.staff.body", { name: user.name, email: user.email })}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <LogoutButton locale={locale} />
            <Button asChild variant="secondary">
              <Link href="/">{t("register.staff.home")}</Link>
            </Button>
          </div>
        </Card>
      </Shell>
    );
  }

  const state = await getRegistration();

  if (state.completed) {
    if (searchParams.resume === "1") redirect("/dashboard");
    // Only the moment of finishing shows the summary (?step=4). Otherwise an
    // owner who is already registered and clicks "List your business" wants to
    // add a listing, not to reread their registration.
    if (searchParams.step !== "4") redirect("/dashboard/new-listing");
    return (
      <Layout current={4} furthest={4} completed>
        <CompleteStep state={state} locale={locale} />
      </Layout>
    );
  }

  const furthest = state.step;
  const requested = Number(searchParams.step);
  let current =
    Number.isInteger(requested) && requested >= 1 && requested <= furthest ? requested : furthest;
  // The order summary needs a plan; without one, step 3 is step 2.
  if (current === 3 && state.order === null) current = 2;

  let body: JSX.Element;
  if (current === 1) {
    const categories = await getCategories();
    body = (
      <DetailsStep
        categories={categories}
        existing={{ account: state.account, details: state.details }}
        locale={locale}
      />
    );
  } else if (current === 2 || state.order === null) {
    const plans = await getPlans();
    body = (
      <PlanStep plans={plans} selectedPlanId={state.selected_plan?.id ?? null} locale={locale} />
    );
  } else {
    body = <PaymentStep order={state.order} locale={locale} />;
  }

  return (
    <Layout current={current} furthest={furthest} completed={false}>
      {body}
    </Layout>
  );
}

function Layout({
  current,
  furthest,
  completed,
  children,
}: {
  current: number;
  furthest: number;
  completed: boolean;
  children: React.ReactNode;
}): JSX.Element {
  const locale = getLocale();
  const t = tFor(locale);
  const heading = HEADINGS[current];
  return (
    <Shell>
      <div className="mx-auto max-w-5xl">
        <RegistrationSteps
          current={current}
          furthest={furthest}
          completed={completed}
          locale={locale}
        />
        <p className="mt-6 text-meta text-ink-muted">{t("register.stepOf", { step: current })}</p>
        <h1 className="text-page-title text-ink">{t(`register.headings.${heading}.title`)}</h1>
        <p className="mt-1 text-body text-ink-muted">{t(`register.headings.${heading}.body`)}</p>
        <div className="mt-6">{children}</div>
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }): JSX.Element {
  const locale = getLocale();
  return (
    <>
      <main className="px-4 py-8 sm:px-6">{children}</main>
      <SiteFooter locale={locale} />
    </>
  );
}
