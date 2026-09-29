"use client";

/**
 * Edit the signed-in user's own details.
 *
 * Only the three fields PATCH /profile accepts are editable. Email and role
 * are shown on the page but not here: email is the login identity, and a role
 * you can set yourself is not a role.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import Alert from "@/components/ui/Alert";
import Button from "@/components/ui/Button";
import { FIELD } from "@/components/ui/field";
import { tFor, type Locale } from "@/lib/i18n";
import type { PreferredContactMethod, UserResponse } from "@/lib/types";


/** Each label is dashboard.account.methods.<value>. */
const CONTACT_METHODS: PreferredContactMethod[] = ["email", "sms", "phone"];

export default function ProfileForm({
  user,
  locale,
}: {
  user: UserResponse;
  locale: Locale;
}): JSX.Element {
  const router = useRouter();
  const t = tFor(locale);

  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [contact, setContact] = useState<PreferredContactMethod>(
    user.preferred_contact_method,
  );

  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty =
    name.trim() !== user.name ||
    phone.trim() !== (user.phone ?? "") ||
    contact !== user.preferred_contact_method;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!name.trim()) {
      setError(t("dashboard.account.nameEmpty"));
      return;
    }

    setError(null);
    setSaved(false);
    setSaving(true);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          // Empty clears the number rather than storing "".
          phone: phone.trim() || null,
          preferred_contact_method: contact,
        }),
      });
      const body: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        setError(
          body && typeof body === "object" && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : t("dashboard.common.saveFailed", { status: res.status }),
        );
        return;
      }

      setSaved(true);
      // Re-run the Server Components so the header picks up a changed name.
      router.refresh();
    } catch {
      setError(t("dashboard.common.serverUnreachable"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">
          {t("dashboard.account.name")}
        </span>
        <input
          required
          maxLength={255}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
          className={FIELD}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-sm font-medium text-slate-700">
          {t("dashboard.account.phone")}{" "}
          <span className="font-normal text-slate-500">{t("dashboard.common.optional")}</span>
        </span>
        <input
          type="tel"
          maxLength={32}
          value={phone}
          onChange={(e) => {
            setPhone(e.target.value);
            setSaved(false);
          }}
          className={FIELD}
        />
      </label>

      <label className="block sm:w-56">
        <span className="mb-1 block text-sm font-medium text-slate-700">
          {t("dashboard.account.preferredContact")}
        </span>
        <select
          value={contact}
          onChange={(e) => {
            setContact(e.target.value as PreferredContactMethod);
            setSaved(false);
          }}
          className={FIELD}
        >
          {CONTACT_METHODS.map((m) => (
            <option key={m} value={m}>
              {t(`dashboard.account.methods.${m}`)}
            </option>
          ))}
        </select>
      </label>

      {error !== null ? (
        <Alert locale={locale} tone="error">{error}</Alert>
      ) : null}

      {saved ? (
        <Alert locale={locale} tone="success">{t("dashboard.account.saved")}</Alert>
      ) : null}

      <Button type="submit" disabled={saving || !dirty}>
        {saving ? t("dashboard.common.saving") : t("dashboard.common.saveChanges")}
      </Button>
    </form>
  );
}
