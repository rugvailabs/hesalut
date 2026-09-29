"use client";

/**
 * The KYC form: contact details, a trade licence, a GST number.
 *
 * Two things this form has to be honest about, because getting either wrong
 * wastes the owner's time:
 *
 *   - Licence and GST are optional. Not every trade is licensed and a business
 *     under the small-supplier threshold has no GST number, so the form asks
 *     rather than demands, and says why.
 *   - Resubmitting a verified listing sends it back for review, which takes it
 *     out of public search until someone re-checks it. That is the backend's
 *     behaviour and the form warns before it happens rather than after.
 *
 * Documents upload one at a time, before the form is submitted, so a failed
 * upload is a fixable error next to that field instead of a lost form.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

import { Alert } from "@/components/ds/feedback";
import { Button } from "@/components/ds/primitives";
import { FIELD, LABEL } from "@/components/ds/form";
import { tFor, type Locale } from "@/lib/i18n";
import type { BusinessVerification } from "@/lib/types";
import { MAX_DOCUMENT_MB } from "@/lib/upload-limits";

type UploadState =
  | { kind: "idle" }
  | { kind: "uploading" }
  | { kind: "done"; filename: string; stub: boolean }
  | { kind: "error"; message: string };

interface Props {
  businessId: number;
  businessName: string;
  /** null when nothing has ever been submitted. */
  existing: BusinessVerification | null;
  locale: Locale;
}

/** What the owner sees under a document field once it has one. */
function documentLabel(url: string | null): string | null {
  if (url === null) return null;
  // s3://bucket/kyc/12/license-<uuid>.pdf -> license-<uuid>.pdf
  const tail = url.split("/").pop();
  return tail && tail.length > 0 ? tail : url;
}

export default function VerificationForm({
  businessId,
  businessName,
  existing,
  locale,
}: Props): JSX.Element {
  const router = useRouter();
  const t = tFor(locale);

  const [email, setEmail] = useState(existing?.email ?? "");
  const [mobile, setMobile] = useState(existing?.mobile_number ?? "");
  const [licenseNumber, setLicenseNumber] = useState(
    existing?.license_number ?? "",
  );
  const [gstNumber, setGstNumber] = useState(existing?.gst_number ?? "");

  const [licenseUrl, setLicenseUrl] = useState<string | null>(
    existing?.license_document_url ?? null,
  );
  const [gstUrl, setGstUrl] = useState<string | null>(
    existing?.gst_document_url ?? null,
  );
  const [licenseUpload, setLicenseUpload] = useState<UploadState>({ kind: "idle" });
  const [gstUpload, setGstUpload] = useState<UploadState>({ kind: "idle" });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  // Resubmitting something already verified pulls it out of search, so it asks
  // first. Nothing else on this form needs a confirmation.
  const [confirming, setConfirming] = useState(false);

  const wasVerified = existing?.status === "verified";

  async function upload(
    file: File,
    purpose: "license" | "gst",
    setState: (state: UploadState) => void,
    setUrl: (url: string | null) => void,
  ): Promise<void> {
    setState({ kind: "uploading" });
    setError(null);

    const body = new FormData();
    body.set("file", file);
    body.set("business_id", String(businessId));
    body.set("purpose", purpose);

    try {
      const res = await fetch("/api/dashboard/verification/upload", {
        method: "POST",
        body,
      });
      const payload: unknown = await res.json().catch(() => null);

      if (!res.ok) {
        setState({
          kind: "error",
          message:
            payload && typeof payload === "object" && "detail" in payload
              ? String((payload as { detail: unknown }).detail)
              : t("dashboard.verification.form.uploadFailed", { status: res.status }),
        });
        return;
      }

      const { document_url: documentUrl, stub } = payload as {
        document_url: string;
        stub: boolean;
      };
      setUrl(documentUrl);
      setState({ kind: "done", filename: file.name, stub });
    } catch {
      setState({
        kind: "error",
        message: t("dashboard.common.serverUnreachable"),
      });
    }
  }

  async function submit(): Promise<void> {
    setBusy(true);
    setError(null);
    setConfirming(false);

    try {
      const res = await fetch("/api/dashboard/verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_id: businessId,
          email: email.trim(),
          mobile_number: mobile.trim(),
          license_number: licenseNumber.trim() || null,
          license_document_url: licenseUrl,
          gst_number: gstNumber.trim() || null,
          gst_document_url: gstUrl,
        }),
      });

      if (!res.ok) {
        const payload: unknown = await res.json().catch(() => null);
        setError(
          payload && typeof payload === "object" && "detail" in payload
            ? String((payload as { detail: unknown }).detail)
            : t("dashboard.verification.form.submitFailed", { status: res.status }),
        );
        return;
      }

      setDone(true);
      // The page is a Server Component reading /verification, so this is what
      // repaints the status panel above the form.
      router.refresh();
    } catch {
      setError(t("dashboard.common.serverUnreachable"));
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(event: React.FormEvent): void {
    event.preventDefault();
    if (wasVerified && !confirming) {
      setConfirming(true);
      return;
    }
    void submit();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {done ? (
        <Alert locale={locale} tone="success" title={t("dashboard.verification.form.sentTitle")}>
          {t("dashboard.verification.form.sentBody", { name: businessName })}
        </Alert>
      ) : null}

      {error !== null ? <Alert locale={locale} tone="error">{error}</Alert> : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="kyc-email" className={LABEL}>
            {t("dashboard.verification.form.contactEmail")}
          </label>
          <input
            id="kyc-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={FIELD}
            placeholder="owner@yourbusiness.ca"
          />
          <p className="mt-1 text-meta text-ink-subtle">
            {t("dashboard.verification.form.contactEmailHint")}
          </p>
        </div>

        <div>
          <label htmlFor="kyc-mobile" className={LABEL}>
            {t("dashboard.verification.form.mobile")}
          </label>
          <input
            id="kyc-mobile"
            type="tel"
            required
            autoComplete="tel"
            value={mobile}
            onChange={(e) => setMobile(e.target.value)}
            className={FIELD}
            placeholder="+1 604 555 0142"
          />
          <p className="mt-1 text-meta text-ink-subtle">
            {t("dashboard.verification.form.mobileHint")}
          </p>
        </div>
      </div>

      <fieldset className="rounded-input border border-line p-4">
        <legend className="px-1 text-body font-medium text-ink-muted">
          {t("dashboard.verification.form.licenceLegend")}{" "}
          <span className="font-normal text-ink-subtle">{t("dashboard.common.optional")}</span>
        </legend>
        <p className="mb-3 text-meta text-ink-subtle">
          {t("dashboard.verification.form.licenceHint")}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="kyc-license" className={LABEL}>
              {t("dashboard.verification.form.licenceNumber")}
            </label>
            <input
              id="kyc-license"
              value={licenseNumber}
              onChange={(e) => setLicenseNumber(e.target.value)}
              className={FIELD}
              placeholder="BC-123456"
            />
          </div>

          <DocumentField
            id="kyc-license-doc"
            label={t("dashboard.verification.form.licenceDocument")}
            state={licenseUpload}
            existingLabel={documentLabel(licenseUrl)}
            onFile={(file) =>
              void upload(file, "license", setLicenseUpload, setLicenseUrl)
            }
            t={t}
            onClear={() => {
              setLicenseUrl(null);
              setLicenseUpload({ kind: "idle" });
            }}
          />
        </div>
      </fieldset>

      <fieldset className="rounded-input border border-line p-4">
        <legend className="px-1 text-body font-medium text-ink-muted">
          {t("dashboard.verification.form.gstLegend")}{" "}
          <span className="font-normal text-ink-subtle">{t("dashboard.common.optional")}</span>
        </legend>
        <p className="mb-3 text-meta text-ink-subtle">
          {t("dashboard.verification.form.gstHint")}
        </p>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="kyc-gst" className={LABEL}>
              {t("dashboard.verification.form.gstNumber")}
            </label>
            <input
              id="kyc-gst"
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value)}
              className={FIELD}
              placeholder="123456789RT0001"
            />
            <p className="mt-1 text-meta text-ink-subtle">
              {t("dashboard.verification.form.gstNumberHint")}
            </p>
          </div>

          <DocumentField
            id="kyc-gst-doc"
            label={t("dashboard.verification.form.gstDocument")}
            state={gstUpload}
            existingLabel={documentLabel(gstUrl)}
            onFile={(file) => void upload(file, "gst", setGstUpload, setGstUrl)}
            t={t}
            onClear={() => {
              setGstUrl(null);
              setGstUpload({ kind: "idle" });
            }}
          />
        </div>
      </fieldset>

      {confirming ? (
        <Alert locale={locale} tone="warning" title={t("dashboard.verification.form.confirmTitle")}>
          <p>{t("dashboard.verification.form.confirmBody", { name: businessName })}</p>
          <div className="mt-2 flex gap-2">
            <Button type="submit" size="sm" disabled={busy}>
              {busy
                ? t("dashboard.common.sending")
                : t("dashboard.verification.form.confirmYes")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setConfirming(false)}
            >
              {t("dashboard.common.cancel")}
            </Button>
          </div>
        </Alert>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            disabled={
              busy ||
              licenseUpload.kind === "uploading" ||
              gstUpload.kind === "uploading"
            }
          >
            {busy
              ? t("dashboard.common.sending")
              : existing === null
                ? t("dashboard.verification.form.submit")
                : t("dashboard.verification.form.resubmit")}
          </Button>
          <p className="text-meta text-ink-subtle">
            {t("dashboard.verification.form.manualHint")}
          </p>
        </div>
      )}
    </form>
  );
}

/** A file input that uploads immediately and reports what it did. */
function DocumentField({
  id,
  label,
  state,
  existingLabel,
  onFile,
  onClear,
  t,
}: {
  id: string;
  label: string;
  state: UploadState;
  existingLabel: string | null;
  onFile: (file: File) => void;
  onClear: () => void;
  t: ReturnType<typeof tFor>;
}): JSX.Element {
  return (
    <div>
      <label htmlFor={id} className={LABEL}>
        {label}
      </label>
      <input
        id={id}
        type="file"
        accept="application/pdf,image/jpeg,image/png,image/heic,image/webp"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
        className="block w-full text-body text-ink-muted file:mr-3 file:rounded-input file:border-0 file:bg-brand-700 file:px-3 file:py-2 file:text-body file:font-medium file:text-ink-inverse hover:file:bg-brand-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      />

      <div className="mt-1 text-meta" aria-live="polite">
        {state.kind === "uploading" ? (
          <span className="text-ink-subtle">
            {t("dashboard.verification.form.uploading")}
          </span>
        ) : state.kind === "error" ? (
          <span className="text-danger">{state.message}</span>
        ) : state.kind === "done" ? (
          <span className="text-success">
            {state.stub
              ? t("dashboard.verification.form.recordedStub", { file: state.filename })
              : t("dashboard.verification.form.uploaded", { file: state.filename })}
          </span>
        ) : existingLabel !== null ? (
          <span className="text-ink-subtle">
            {t("dashboard.verification.form.onFile", { file: existingLabel })}{" "}
            <button
              type="button"
              onClick={onClear}
              className="underline hover:text-ink-muted"
            >
              {t("dashboard.verification.form.remove")}
            </button>
          </span>
        ) : (
          <span className="text-ink-subtle">
            {t("dashboard.verification.form.fileHint", { mb: MAX_DOCUMENT_MB })}
          </span>
        )}
      </div>
    </div>
  );
}
