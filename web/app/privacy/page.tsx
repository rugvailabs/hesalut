/**
 * /privacy
 *
 * DRAFT, and marked as such on the page itself. The substance is accurate
 * because it was written from the actual schema - the tables listed below are
 * the tables this app really has - but a privacy policy is a legal document
 * and this one has not been reviewed.
 *
 * Quebec's Law 25 and PIPEDA are named because the backend already models
 * consent (app/models/consent.py, with the Law 25 language migration behind
 * it), so the commitments here are ones the code can actually keep.
 *
 * The body exists once in English and once in French, picked by the visitor's
 * language; the two must say the same thing, so change them together.
 */

import type { Metadata } from "next";
import Link from "next/link";

import Prose from "@/components/ds/Prose";
import { Alert } from "@/components/ds/feedback";
import { tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = tFor(getLocale());
  return {
    title: t("pages.privacy.title"),
    description: t("pages.privacy.metaDescription"),
  };
}

function PrivacyBodyEn(): JSX.Element {
  return (
    <>
      <div className="not-prose">
        <Alert tone="warning" title="Draft - not yet legally reviewed">
          The practices described here match what the software actually does,
          but this text has not been checked against PIPEDA or Quebec&apos;s
          Law 25 by a lawyer. Do not publish it as a binding policy until it
          has been.
        </Alert>
      </div>

      <h2>What we collect</h2>
      <p>Only what a directory needs to work:</p>
      <ul>
        <li>
          <strong>Your account.</strong> Name, email address, mobile number, and
          a hashed password. We never store the password itself.
        </li>
        <li>
          <strong>Your listings,</strong> if you own a business: everything on
          the listing, plus the verification documents you send us.
        </li>
        <li>
          <strong>What you send through the site.</strong> Enquiries to
          businesses, chat messages, reviews you write, and anything you send us
          through <Link href="/contact">contact</Link>.
        </li>
        <li>
          <strong>That an enquiry happened.</strong> When you reveal a phone
          number on a listing, we record that so the business owner can see the
          lead. We do not record the call - we cannot, and we do not want to.
        </li>
        <li>
          <strong>What search showed you.</strong> When search results are shown
          we record which listings appeared, in what order, and whether you
          opened, called or enquired with one. We keep your approximate area -
          to about a kilometre - never your exact location, and link it to your
          account only if you were signed in. Business owners see totals for
          their own listing, never who searched.
        </li>
      </ul>
      <p>
        We do not sell any of it, and we do not use it to target advertising at
        you. Some businesses pay to appear higher in search; those results are
        always labelled Featured or Promoted.
      </p>

      <h2>Verification documents</h2>
      <p>
        Documents sent for business verification are stored separately from the
        public listing and are read only by a reviewer deciding that
        application. Licence and tax numbers never appear on a public page.
      </p>

      <h2>What is public</h2>
      <p>
        Reviews you write are public and carry your name. Listing details you
        publish are public - that is their purpose. Your email address, your
        mobile number and your verification documents are not, and are never
        shown on a listing.
      </p>

      <h2>Consent</h2>
      <p>
        We ask before we email or text you anything that is not a direct reply
        to something you sent. That consent is recorded, and you can withdraw it
        at any time without losing your account.
      </p>

      <h2>Your rights</h2>
      <p>
        Under PIPEDA, and under Law 25 if you are in Quebec, you can ask us to
        show you what we hold about you, correct it, or delete it. Write to{" "}
        <Link href="/contact">contact</Link> and we will act on it.
      </p>
      <p>
        Deleting your account removes your personal details. Reviews you wrote
        are kept but detached from you - the business you reviewed keeps a
        record it has already replied to, and the rating stays honest - so they
        show as written by a former user rather than disappearing.
      </p>

      <h2>How long we keep things</h2>
      <ul>
        <li>Your account and listings: until you delete them.</li>
        <li>Enquiries and chat messages: kept, because they are the record of a conversation both sides took part in.</li>
        <li>Verification documents: kept while the listing is verified, as the evidence for that decision.</li>
      </ul>

      <h2>Where it lives</h2>
      <p>
        This is a development deployment. Data is held in a Postgres database
        and an object store operated for this project, and is not shared with
        third parties. There is no analytics or advertising tracking on this
        site.
      </p>

      <h2>Getting in touch</h2>
      <p>
        Questions about any of this go to <Link href="/contact">contact</Link>.
      </p>
    </>
  );
}

/*
 * French version of the privacy policy.
 *
 * TRANSLATION - NOT YET REVIEWED. This French text is a translation of the
 * English body above and must be reviewed by a qualified person (a lawyer or
 * certified legal translator) before launch. Quebec's Charter of the French
 * Language requires French versions of documents like this one, and the
 * French text has to be as accurate and binding as the English.
 */
function PrivacyBodyFr(): JSX.Element {
  return (
    <>
      <div className="not-prose">
        <Alert tone="warning" title="Ébauche - pas encore révisée par un juriste">
          Les pratiques décrites ici correspondent à ce que fait réellement le
          logiciel, mais ce texte n’a pas été vérifié par un avocat au regard de
          la LPRPDE ou de la Loi 25 du Québec. Ne le publiez pas comme
          politique contraignante avant qu’il l’ait été.
        </Alert>
      </div>

      <h2>Ce que nous recueillons</h2>
      <p>Seulement ce dont un annuaire a besoin pour fonctionner :</p>
      <ul>
        <li>
          <strong>Votre compte.</strong> Votre nom, votre adresse courriel,
          votre numéro de cellulaire et un mot de passe haché. Nous ne
          conservons jamais le mot de passe lui-même.
        </li>
        <li>
          <strong>Vos fiches,</strong> si vous êtes propriétaire d’une
          entreprise : tout ce qui figure sur la fiche, ainsi que les documents
          de vérification que vous nous envoyez.
        </li>
        <li>
          <strong>Ce que vous envoyez par le site.</strong> Les demandes
          adressées aux entreprises, les messages de clavardage, les avis que
          vous rédigez et tout ce que vous nous envoyez par la page{" "}
          <Link href="/contact">Nous joindre</Link>.
        </li>
        <li>
          <strong>Le fait qu’une demande a eu lieu.</strong> Lorsque vous
          affichez le numéro de téléphone d’une fiche, nous l’enregistrons afin
          que le propriétaire de l’entreprise puisse voir cette piste. Nous
          n’enregistrons pas l’appel - nous ne le pouvons pas, et nous ne le
          voulons pas.
        </li>
        <li>
          <strong>Ce que la recherche vous a présenté.</strong> Lorsque des
          résultats de recherche s’affichent, nous enregistrons les fiches qui
          sont apparues, dans quel ordre, et si vous avez ouvert l’une d’elles,
          appelé l’entreprise ou lui avez envoyé une demande. Nous conservons
          votre secteur approximatif - à environ un kilomètre près -, jamais
          votre position exacte, et ne le lions à votre compte que si vous étiez
          connecté. Les propriétaires d’entreprise voient les totaux pour leur
          propre fiche, jamais l’identité des personnes qui ont fait une
          recherche.
        </li>
      </ul>
      <p>
        Nous n’en vendons rien et nous ne l’utilisons pas pour vous cibler avec
        de la publicité. Certaines entreprises paient pour apparaître plus haut
        dans la recherche ; ces résultats portent toujours la mention
        « En vedette » ou « Promu ».
      </p>

      <h2>Documents de vérification</h2>
      <p>
        Les documents envoyés pour la vérification d’une entreprise sont
        conservés séparément de la fiche publique et ne sont consultés que par
        l’examinateur qui statue sur cette demande. Les numéros de permis et
        les numéros fiscaux n’apparaissent jamais sur une page publique.
      </p>

      <h2>Ce qui est public</h2>
      <p>
        Les avis que vous rédigez sont publics et portent votre nom. Les
        renseignements que vous publiez sur une fiche sont publics - c’est leur
        raison d’être. Votre adresse courriel, votre numéro de cellulaire et vos
        documents de vérification ne le sont pas et ne sont jamais affichés sur
        une fiche.
      </p>

      <h2>Consentement</h2>
      <p>
        Nous demandons votre accord avant de vous envoyer, par courriel ou par
        texto, tout message qui n’est pas une réponse directe à quelque chose
        que vous nous avez envoyé. Ce consentement est consigné, et vous pouvez
        le retirer en tout temps sans perdre votre compte.
      </p>

      <h2>Vos droits</h2>
      <p>
        En vertu de la LPRPDE, et de la Loi 25 si vous êtes au Québec, vous
        pouvez nous demander de vous communiquer les renseignements que nous
        détenons à votre sujet, de les rectifier ou de les supprimer. Écrivez-nous
        par la page <Link href="/contact">Nous joindre</Link> et nous
        donnerons suite à votre demande.
      </p>
      <p>
        La suppression de votre compte efface vos renseignements personnels. Les
        avis que vous avez rédigés sont conservés, mais dissociés de vous -
        l’entreprise évaluée garde un avis auquel elle a déjà répondu, et la
        note reste fidèle - ils apparaissent donc comme rédigés par un ancien
        utilisateur plutôt que de disparaître.
      </p>

      <h2>Durée de conservation</h2>
      <ul>
        <li>Votre compte et vos fiches : jusqu’à ce que vous les supprimiez.</li>
        <li>Demandes et messages de clavardage : conservés, parce qu’ils constituent le registre d’une conversation à laquelle les deux parties ont pris part.</li>
        <li>Documents de vérification : conservés tant que la fiche est vérifiée, comme preuve à l’appui de cette décision.</li>
      </ul>

      <h2>Où sont conservées les données</h2>
      <p>
        Il s’agit d’un déploiement de développement. Les données sont conservées
        dans une base de données Postgres et un stockage d’objets exploités pour
        ce projet, et ne sont pas communiquées à des tiers. Ce site n’utilise
        aucun outil de suivi analytique ou publicitaire.
      </p>

      <h2>Nous joindre</h2>
      <p>
        Pour toute question à ce sujet, écrivez-nous par la page{" "}
        <Link href="/contact">Nous joindre</Link>.
      </p>
    </>
  );
}

export default function PrivacyPage(): JSX.Element {
  const locale = getLocale();
  const t = tFor(locale);
  return (
    <Prose
      title={t("pages.privacy.title")}
      lede={t("pages.privacy.lede")}
      updated="2026-09-10"
    >
      {locale === "fr" ? <PrivacyBodyFr /> : <PrivacyBodyEn />}
    </Prose>
  );
}
