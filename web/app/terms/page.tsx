/**
 * /terms
 *
 * DRAFT. Written to describe what the product actually does, and marked
 * unmistakably as not yet reviewed by a lawyer - see the notice at the top,
 * which is rendered, not a code comment. Publishing invented legal text
 * dressed as final terms would be worse than having no page.
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
    title: t("pages.terms.title"),
    description: t("pages.terms.metaDescription"),
  };
}

function TermsBodyEn(): JSX.Element {
  return (
    <>
      <div className="not-prose">
        <Alert tone="warning" title="Draft - not yet legally reviewed">
          This describes how the product actually behaves today and has not been
          checked by a lawyer. Do not rely on it as a binding agreement until it
          has been.
        </Alert>
      </div>

      <h2>Using the directory</h2>
      <p>
        Browsing and searching is open to anyone. You need an account to leave a
        review or to message a business, and you need to register with an email
        address and a password.
      </p>

      <h2>Accounts</h2>
      <ul>
        <li>One account per person, and you are responsible for what happens under it.</li>
        <li>Give us an email address you actually read - it is how we reach you.</li>
        <li>
          Do not register on behalf of somebody else, or claim a business you do
          not represent. Verification exists to catch this.
        </li>
      </ul>

      <h2>Listings</h2>
      <p>
        If you list a business, you are stating that it exists, that you are
        entitled to represent it, and that what you have written about it is
        accurate. We review listings before they appear publicly and verify the
        business behind them; we can reject or suspend a listing, and if we do,
        you are told why.
      </p>
      <p>
        You keep ownership of what you upload. You give us permission to display
        it in the directory and in search results, which is the only reason we
        are holding it.
      </p>

      <h2>Reviews</h2>
      <ul>
        <li>Review only businesses you have genuinely dealt with.</li>
        <li>One review per business. Owners can reply once; they cannot delete reviews.</li>
        <li>
          Do not post anything false, abusive, or that identifies somebody who
          did not consent to it.
        </li>
        <li>
          We can remove a review that breaks these rules. We do not remove one
          because a business asked us to.
        </li>
      </ul>

      <h2>What we do not promise</h2>
      <p>
        We do not vouch for the quality, price, punctuality or licensing of any
        business listed here. Verification confirms a business is real - nothing
        more. Any arrangement you make with a business is between you and them,
        and we are not a party to it.
      </p>
      <p>
        We also do not promise the site is always available or always correct.
        This is an early-stage product and parts of it are unfinished.
      </p>

      <h2>Ending things</h2>
      <p>
        You can stop using the site at any time and ask us to delete your
        account - see the <Link href="/privacy">privacy policy</Link>. We can
        suspend an account that is being used to abuse the directory or the
        people on it.
      </p>

      <h2>Changes</h2>
      <p>
        When these terms change, the date at the top of this page changes with
        them.
      </p>
    </>
  );
}

/*
 * French version of the terms of use.
 *
 * TRANSLATION - NOT YET REVIEWED. This French text is a translation of the
 * English body above and must be reviewed by a qualified person (a lawyer or
 * certified legal translator) before launch. Quebec's Charter of the French
 * Language requires French versions of documents like this one, and the
 * French text has to be as accurate and binding as the English.
 */
function TermsBodyFr(): JSX.Element {
  return (
    <>
      <div className="not-prose">
        <Alert tone="warning" title="Ébauche - pas encore révisée par un juriste">
          Ce texte décrit le fonctionnement actuel du produit et n’a pas été
          vérifié par un avocat. Ne vous y fiez pas comme à une entente
          contraignante avant qu’il l’ait été.
        </Alert>
      </div>

      <h2>Utilisation de l’annuaire</h2>
      <p>
        La navigation et la recherche sont ouvertes à tous. Il faut un compte
        pour publier un avis ou écrire à une entreprise, et il faut s’inscrire
        avec une adresse courriel et un mot de passe.
      </p>

      <h2>Comptes</h2>
      <ul>
        <li>Un compte par personne, et vous êtes responsable de ce qui se fait avec celui-ci.</li>
        <li>Donnez-nous une adresse courriel que vous consultez vraiment - c’est ainsi que nous vous joignons.</li>
        <li>
          Ne vous inscrivez pas au nom d’une autre personne et ne revendiquez
          pas une entreprise que vous ne représentez pas. La vérification existe
          pour détecter ces cas.
        </li>
      </ul>

      <h2>Fiches</h2>
      <p>
        Si vous inscrivez une entreprise, vous déclarez qu’elle existe, que vous
        êtes autorisé à la représenter et que ce que vous avez écrit à son sujet
        est exact. Nous examinons les fiches avant leur publication et vérifions
        l’entreprise derrière chacune ; nous pouvons refuser ou suspendre une
        fiche et, le cas échéant, nous vous en indiquons la raison.
      </p>
      <p>
        Vous demeurez propriétaire de ce que vous téléversez. Vous nous
        autorisez à l’afficher dans l’annuaire et dans les résultats de
        recherche, ce qui est la seule raison pour laquelle nous le conservons.
      </p>

      <h2>Avis</h2>
      <ul>
        <li>N’évaluez que des entreprises avec lesquelles vous avez réellement fait affaire.</li>
        <li>Un avis par entreprise. Les propriétaires peuvent répondre une fois ; ils ne peuvent pas supprimer d’avis.</li>
        <li>
          Ne publiez rien de faux ou d’injurieux, ni rien qui permette
          d’identifier une personne qui n’y a pas consenti.
        </li>
        <li>
          Nous pouvons retirer un avis qui enfreint ces règles. Nous n’en
          retirons pas un simplement parce qu’une entreprise nous l’a demandé.
        </li>
      </ul>

      <h2>Ce que nous ne promettons pas</h2>
      <p>
        Nous ne garantissons ni la qualité, ni les prix, ni la ponctualité, ni
        les permis d’aucune entreprise inscrite ici. La vérification confirme
        qu’une entreprise existe réellement - rien de plus. Toute entente que
        vous concluez avec une entreprise ne concerne que vous et elle, et nous
        n’y sommes pas partie.
      </p>
      <p>
        Nous ne promettons pas non plus que le site sera toujours accessible ou
        toujours exact. Ce produit en est à ses débuts, et certaines de ses
        parties sont inachevées.
      </p>

      <h2>Fin de l’utilisation</h2>
      <p>
        Vous pouvez cesser d’utiliser le site en tout temps et nous demander de
        supprimer votre compte - consultez la{" "}
        <Link href="/privacy">politique de confidentialité</Link>. Nous pouvons
        suspendre un compte utilisé pour abuser de l’annuaire ou des personnes
        qui y figurent.
      </p>

      <h2>Modifications</h2>
      <p>
        Lorsque ces conditions changent, la date en haut de cette page change
        aussi.
      </p>
    </>
  );
}

export default function TermsPage(): JSX.Element {
  const locale = getLocale();
  const t = tFor(locale);
  return (
    <Prose
      title={t("pages.terms.title")}
      lede={t("pages.terms.lede")}
      updated="2026-09-10"
    >
      {locale === "fr" ? <TermsBodyFr /> : <TermsBodyEn />}
    </Prose>
  );
}
