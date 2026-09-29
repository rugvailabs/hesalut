/**
 * /contact - customer care, feedback and bug reports in one place.
 *
 * The form is a client island inside a Suspense boundary, because it reads
 * ?kind= with useSearchParams and that opts the whole route into client-side
 * rendering otherwise. It cannot read the language cookie itself, so the
 * locale is handed down as a prop.
 */

import type { Metadata } from "next";
import { Suspense } from "react";

import Prose from "@/components/ds/Prose";
import SupportForm from "@/components/ds/SupportForm";
import { Skeleton } from "@/components/ds/feedback";
import { tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = tFor(getLocale());
  return {
    title: t("pages.contact.title"),
    description: t("pages.contact.metaDescription"),
  };
}

function ContactBodyEn(): JSX.Element {
  return (
    <>
      <p>
        We reply by email to the address you give. There is no phone line: this
        is a small team, and an unanswered number would be worse than not
        offering one.
      </p>

      <p>
        <strong>Chasing a business, not us?</strong> If you are waiting on a
        quote or a callback, contact the business from its own listing - the
        enquiry goes straight to the owner&apos;s inbox. We cannot answer for
        them or make them reply.
      </p>
    </>
  );
}

function ContactBodyFr(): JSX.Element {
  return (
    <>
      <p>
        Nous répondons par courriel à l’adresse que vous indiquez. Il n’y a pas
        de ligne téléphonique : nous sommes une petite équipe, et un numéro
        sans réponse serait pire que de ne pas en offrir.
      </p>

      <p>
        <strong>Vous attendez des nouvelles d’une entreprise, pas de nous ?</strong>{" "}
        Si vous attendez une soumission ou un rappel, contactez l’entreprise à
        partir de sa propre fiche - la demande arrive directement dans la boîte
        de réception du propriétaire. Nous ne pouvons pas répondre à sa place
        ni l’obliger à répondre.
      </p>
    </>
  );
}

export default function ContactPage(): JSX.Element {
  const locale = getLocale();
  const t = tFor(locale);
  return (
    <Prose
      title={t("pages.contact.title")}
      lede={t("pages.contact.lede")}
      updated="2026-09-10"
    >
      {locale === "fr" ? <ContactBodyFr /> : <ContactBodyEn />}

      <div className="not-prose mt-6">
        <Suspense fallback={<Skeleton className="h-96 w-full rounded-card" />}>
          <SupportForm locale={locale} />
        </Suspense>
      </div>
    </Prose>
  );
}
