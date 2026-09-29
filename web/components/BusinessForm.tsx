"use client";

/**
 * Create/edit form for a listing.
 *
 * One component with a `mode` prop rather than two near-identical forms: the
 * field set, validation and location picker are the same either way, only the
 * request differs (POST vs PATCH).
 *
 * Submits through /api/dashboard/listings, a same-origin route handler,
 * because the backend has no CORS and the JWT is in an httpOnly cookie the
 * browser cannot read.
 */

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ds/feedback";
import { Button, Card } from "@/components/ds/primitives";
import { FIELD, LABEL } from "@/components/ds/form";
import { tFor, type Locale } from "@/lib/i18n";
import { hasGoogleMaps } from "@/lib/maps";
import type { BusinessCreate, BusinessDetail, Category } from "@/lib/types";

type LocationPickerProps = {
  latitude: number | null;
  longitude: number | null;
  onPick: (lat: number, lng: number) => void;
  addressQuery?: string;
  locale?: Locale;
};

function MapLoading({ locale }: { locale: Locale }): JSX.Element {
  return (
    <div className="flex h-64 w-full items-center justify-center rounded-card border border-line bg-surface-muted text-body text-ink-subtle">
      {tFor(locale)("dashboard.form.loadingMap")}
    </div>
  );
}

// Both map libraries touch window at import, so neither can be server-rendered.
// Google Maps when a key is configured, Leaflet otherwise (see lib/maps).
//
// One dynamic() per language, because the loading placeholder receives no
// props and so cannot be told the locale. Each keeps its import() inline, as
// next/dynamic needs for ssr: false; both resolve to the same chunk, so
// switching language does not reload the map.
const LOCATION_PICKERS: Record<Locale, React.ComponentType<LocationPickerProps>> = {
  en: dynamic<LocationPickerProps>(
    () =>
      hasGoogleMaps
        ? import("@/components/maps/GoogleLocationPicker")
        : import("@/components/LocationPicker"),
    { ssr: false, loading: () => <MapLoading locale="en" /> },
  ),
  fr: dynamic<LocationPickerProps>(
    () =>
      hasGoogleMaps
        ? import("@/components/maps/GoogleLocationPicker")
        : import("@/components/LocationPicker"),
    { ssr: false, loading: () => <MapLoading locale="fr" /> },
  ),
};

/** Each day's label is dashboard.form.days.<key>. */
const DAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

const PRICE_RANGES = ["", "$", "$$", "$$$", "$$$$"];


type OpeningHours = Record<string, [string, string][]>;

/** One day's open/close, or nulls when closed. */
function dayRange(hours: OpeningHours, day: string): [string, string] | null {
  const ranges = hours[day];
  return ranges && ranges.length > 0 ? ranges[0] : null;
}

export default function BusinessForm({
  mode,
  categories,
  listing,
  locale,
}: {
  mode: "create" | "edit";
  categories: Category[];
  /** Present in edit mode; the form is pre-filled from it. */
  listing?: BusinessDetail;
  locale: Locale;
}): JSX.Element {
  const router = useRouter();
  const t = tFor(locale);
  const LocationPicker = LOCATION_PICKERS[locale];

  const [name, setName] = useState(listing?.name ?? "");
  const [categoryId, setCategoryId] = useState<string>(
    listing?.category_id != null ? String(listing.category_id) : "",
  );
  const [description, setDescription] = useState(listing?.description ?? "");
  const [phone, setPhone] = useState(listing?.phone ?? "");
  const [whatsapp, setWhatsapp] = useState(listing?.whatsapp ?? "");
  const [email, setEmail] = useState(listing?.email ?? "");
  const [website, setWebsite] = useState(listing?.website ?? "");
  const [address, setAddress] = useState(listing?.address ?? "");
  const [city, setCity] = useState(listing?.city ?? "Vancouver");
  const [province, setProvince] = useState(listing?.province ?? "BC");
  const [postalCode, setPostalCode] = useState(listing?.postal_code ?? "");
  const [priceRange, setPriceRange] = useState(listing?.price_range ?? "");
  const [latitude, setLatitude] = useState<number | null>(listing?.latitude ?? null);
  const [longitude, setLongitude] = useState<number | null>(
    listing?.longitude ?? null,
  );
  const [tags, setTags] = useState<string[]>(listing?.tags ?? []);
  const [tagDraft, setTagDraft] = useState("");
  const [hours, setHours] = useState<OpeningHours>(listing?.opening_hours ?? {});

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function addTag(): void {
    const value = tagDraft.trim().toLowerCase();
    // Silently ignoring a duplicate is friendlier than an error for a chip input.
    if (value && !tags.includes(value)) setTags([...tags, value]);
    setTagDraft("");
  }

  function setDay(day: string, open: string, close: string): void {
    setHours((current) => {
      const next = { ...current };
      // Both blank means closed; store nothing rather than an empty range.
      if (!open || !close) delete next[day];
      else next[day] = [[open, close]];
      return next;
    });
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError(null);

    if (!categoryId) {
      setError(t("dashboard.form.chooseCategoryError"));
      return;
    }

    setSubmitting(true);
    const payload: BusinessCreate = {
      name: name.trim(),
      category_id: Number(categoryId),
      description: description.trim() || null,
      address: address.trim() || null,
      city: city.trim(),
      province: province.trim().toUpperCase(),
      postal_code: postalCode.trim() || null,
      latitude,
      longitude,
      phone: phone.trim() || null,
      whatsapp: whatsapp.trim() || null,
      email: email.trim() || null,
      website: website.trim() || null,
      price_range: priceRange || null,
      tags: tags.length > 0 ? tags : null,
      opening_hours: Object.keys(hours).length > 0 ? hours : null,
    };

    try {
      const res = await fetch("/api/dashboard/listings", {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "create" ? payload : { id: listing?.id, ...payload },
        ),
      });
      const body: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        const detail =
          body && typeof body === "object" && "detail" in body
            ? String((body as { detail: unknown }).detail)
            : t("dashboard.common.saveFailed", { status: res.status });
        setError(detail);
        return;
      }

      router.push("/dashboard");
      // Re-run the dashboard's Server Component so the new listing appears.
      router.refresh();
    } catch {
      setError(t("dashboard.common.serverUnreachable"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card className="space-y-4 p-4">
        <h2 className="font-semibold text-ink">{t("dashboard.form.basics")}</h2>

        <label className="block">
          <span className={LABEL}>
            {t("dashboard.form.name")}
          </span>
          <input
            required
            maxLength={255}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={FIELD}
          />
        </label>

        <label className="block">
          <span className={LABEL}>
            {t("dashboard.form.category")}
          </span>
          <select
            required
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className={FIELD}
          >
            <option value="">{t("dashboard.form.chooseCategory")}</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className={LABEL}>
            {t("dashboard.form.description")}
          </span>
          <textarea
            rows={4}
            maxLength={5000}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className={FIELD}
          />
        </label>

        <label className="block sm:w-40">
          <span className={LABEL}>
            {t("dashboard.form.priceRange")}
          </span>
          <select
            value={priceRange}
            onChange={(e) => setPriceRange(e.target.value)}
            className={FIELD}
          >
            {PRICE_RANGES.map((p) => (
              <option key={p || "none"} value={p}>
                {p || t("dashboard.form.notSpecified")}
              </option>
            ))}
          </select>
        </label>
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-semibold text-ink">{t("dashboard.form.contact")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={LABEL}>
              {t("dashboard.form.phone")}
            </span>
            <input
              type="tel"
              maxLength={32}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className={LABEL}>
              {t("dashboard.form.whatsapp")}
            </span>
            <input
              type="tel"
              maxLength={32}
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className={LABEL}>
              {t("dashboard.form.email")}
            </span>
            <input
              type="email"
              maxLength={320}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className={LABEL}>
              {t("dashboard.form.website")}
            </span>
            <input
              type="url"
              placeholder="https://example.com"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              className={FIELD}
            />
          </label>
        </div>
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-semibold text-ink">{t("dashboard.form.location")}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={LABEL}>
              {t("dashboard.form.address")}
            </span>
            <input
              maxLength={255}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className={LABEL}>
              {t("dashboard.form.city")}
            </span>
            <input
              required
              maxLength={128}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className={LABEL}>
              {t("dashboard.form.province")}
            </span>
            <input
              required
              maxLength={2}
              value={province}
              onChange={(e) => setProvince(e.target.value)}
              className={FIELD}
            />
          </label>
          <label className="block">
            <span className={LABEL}>
              {t("dashboard.form.postalCode")}
            </span>
            <input
              maxLength={16}
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              className={FIELD}
            />
          </label>
        </div>

        <LocationPicker
          locale={locale}
          latitude={latitude}
          longitude={longitude}
          onPick={(lat, lng) => {
            setLatitude(lat);
            setLongitude(lng);
          }}
          addressQuery={[address, city, province, postalCode]
            .map((part) => part.trim())
            .filter(Boolean)
            .join(", ")}
        />
      </Card>

      <Card className="space-y-4 p-4">
        <h2 className="font-semibold text-ink">{t("dashboard.form.tags")}</h2>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-pill bg-surface-muted px-2 py-0.5 text-meta text-ink-muted ring-1 ring-inset ring-line"
            >
              {tag}
              <button
                type="button"
                onClick={() => setTags(tags.filter((t) => t !== tag))}
                aria-label={t("dashboard.form.removeTag", { tag })}
                className="rounded text-ink-subtle hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                ×
              </button>
            </span>
          ))}
          {tags.length === 0 ? (
            <span className="text-body text-ink-subtle">{t("dashboard.form.noTags")}</span>
          ) : null}
        </div>
        <div className="flex gap-2">
          <input
            value={tagDraft}
            onChange={(e) => setTagDraft(e.target.value)}
            onKeyDown={(e) => {
              // Enter adds a tag; without this it would submit the whole form.
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            placeholder={t("dashboard.form.tagPlaceholder")}
            className={FIELD}
          />
          <Button type="button" variant="secondary" onClick={addTag}>
            {t("dashboard.form.addTag")}
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 p-4">
        <h2 className="font-semibold text-ink">{t("dashboard.form.hours")}</h2>
        <p className="text-body text-ink-muted">
          {t("dashboard.form.hoursHint")}
        </p>
        <div className="space-y-2">
          {DAYS.map((key) => {
            const range = dayRange(hours, key);
            return (
              <div key={key} className="flex flex-wrap items-center gap-2">
                <span className="w-20 flex-none text-body text-ink-muted sm:w-24">
                  {t(`dashboard.form.days.${key}`)}
                </span>
                <input
                  type="time"
                  value={range?.[0] ?? ""}
                  onChange={(e) => setDay(key, e.target.value, range?.[1] ?? "")}
                  className="rounded-input border border-line-strong px-2 py-1 text-body"
                />
                <span className="text-ink-subtle">–</span>
                <input
                  type="time"
                  value={range?.[1] ?? ""}
                  onChange={(e) => setDay(key, range?.[0] ?? "", e.target.value)}
                  className="rounded-input border border-line-strong px-2 py-1 text-body"
                />
              </div>
            );
          })}
        </div>
      </Card>

      {error !== null ? (
        <Alert locale={locale} tone="error">{error}</Alert>
      ) : null}

      {mode === "edit" && listing?.status === "approved" ? (
        <p className="rounded bg-warning-bg px-3 py-2 text-body text-warning">
          {t("dashboard.form.liveWarning")}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button type="submit" disabled={submitting}>
          {submitting
            ? t("dashboard.common.saving")
            : mode === "create"
              ? t("dashboard.form.submitForReview")
              : t("dashboard.common.saveChanges")}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/dashboard")}
        >
          {t("dashboard.common.cancel")}
        </Button>
      </div>
    </form>
  );
}
