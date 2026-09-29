"use client";

/**
 * Email + password sign-in and sign-up. The only way into the app.
 *
 * Phone one-time-code sign-in used to sit above this form and has been
 * removed: a mobile number is now a contact detail collected at sign-up, never
 * a credential. That distinction is the point of this file - the number is
 * required, and it still cannot sign anybody in.
 *
 * Credentials are posted to our own /api/auth/session route, which performs
 * the FastAPI exchange server-side and sets the httpOnly cookies. The browser
 * never sees the JWT.
 *
 * The `required` attributes below are a courtesy that catches a typo before a
 * round trip; the session route enforces the same rules, because a form is not
 * a constraint and anything can POST there.
 */

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ds/feedback";
import { Button, Input, Label } from "@/components/ds/primitives";
import { HINT } from "@/components/ds/form";
import { cn } from "@/lib/cn";
import { tFor, type Locale } from "@/lib/i18n";
import type { UserResponse } from "@/lib/types";

type Mode = "login" | "signup";

interface SessionSuccess {
  user: UserResponse;
}

export default function LoginForm({
  next,
  locale,
}: {
  next: string;
  locale: Locale;
}): JSX.Element {
  const router = useRouter();
  const t = tFor(locale);

  const [mode, setMode] = useState<Mode>("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const signup = mode === "signup";

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          signup
            ? {
                mode,
                name,
                email,
                password,
                phone,
                // Business accounts are created by /register, alongside the
                // listing and its plan.
                role: "customer",
              }
            : { mode, email, password },
        ),
      });

      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const detail =
          payload && typeof payload === "object" && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : t("auth.form.failed", { status: res.status });
        setError(detail);
        return;
      }

      const user = (payload as SessionSuccess | null)?.user;
      // The requested page wins. Otherwise admins land on /admin, and business
      // owners on /register, which resumes an unfinished registration or - when
      // it is complete - forwards them to their dashboard.
      const target =
        next ||
        (user?.is_admin
          ? "/admin"
          : user?.role === "business_owner"
            ? "/register?resume=1"
            : "/");

      // refresh() re-runs the Server Components so they see the new cookie.
      router.replace(target);
      router.refresh();
    } catch {
      setError(t("auth.form.unreachable"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* Two modes of one form, not two forms: the fields they share keep
          whatever was typed when you switch. */}
      <div
        className="flex gap-2"
        role="group"
        aria-label={t("auth.form.modeGroup")}
      >
        {(
          [
            ["login", t("auth.form.modeSignIn")],
            ["signup", t("auth.form.modeSignUp")],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => {
              setMode(value);
              setError(null);
            }}
            className={cn(
              "rounded-input px-3 py-1.5 text-body font-medium transition-colors",
              "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
              "focus-visible:outline-ring",
              mode === value
                ? "bg-brand-700 text-ink-inverse"
                : "border border-line-strong bg-surface text-ink hover:bg-surface-muted",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {signup ? (
        <div>
          <Label htmlFor="auth-name">{t("auth.form.name")}</Label>
          <Input
            id="auth-name"
            type="text"
            required
            maxLength={255}
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
          />
        </div>
      ) : null}

      <div>
        <Label htmlFor="auth-email">{t("auth.form.email")}</Label>
        <Input
          id="auth-email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="email"
        />
      </div>

      <div>
        <Label htmlFor="auth-password">{t("auth.form.password")}</Label>
        <Input
          id="auth-password"
          type="password"
          required
          // The backend enforces 8-72 characters on signup.
          minLength={signup ? 8 : undefined}
          maxLength={72}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete={signup ? "new-password" : "current-password"}
        />
        {signup ? <p className={HINT}>{t("auth.form.passwordHint")}</p> : null}
      </div>

      {signup ? (
        <div>
          <Label htmlFor="auth-phone">{t("auth.form.phone")}</Label>
          <Input
            id="auth-phone"
            type="tel"
            required
            maxLength={32}
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            autoComplete="tel"
            placeholder="(604) 555-0142"
          />
          {/* Said plainly, because a required phone number on a sign-up form
              reads as "we will text you a code" - and that is exactly what it
              is not. */}
          <p className={HINT}>{t("auth.form.phoneHint")}</p>
        </div>
      ) : null}

      {signup ? (
        <p className="rounded-input bg-surface-muted px-3 py-2 text-body text-ink-muted">
          {t("auth.form.listingBusiness")}{" "}
          <Link
            href="/register"
            className="font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800"
          >
            {t("auth.form.registerBusiness")}
          </Link>{" "}
          {t("auth.form.listingBusinessAfter")}
        </p>
      ) : null}

      {error !== null ? <Alert locale={locale} tone="error">{error}</Alert> : null}

      <Button type="submit" disabled={submitting} className="w-full">
        {submitting
          ? t("auth.form.working")
          : signup
            ? t("auth.form.submitSignUp")
            : t("auth.form.submitSignIn")}
      </Button>
    </form>
  );
}
