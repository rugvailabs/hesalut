/**
 * /about
 *
 * Written to describe what this actually is right now, not what a directory
 * aspires to be. Every number and claim on this page is checkable against the
 * running app; nothing here says "millions of businesses".
 *
 * The body exists once in English and once in French, picked by the visitor's
 * language; the two must say the same thing, so change them together.
 */

import type { Metadata } from "next";
import Link from "next/link";

import Prose from "@/components/ds/Prose";
import { tFor } from "@/lib/i18n";
import { getLocale } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = tFor(getLocale());
  return {
    title: t("pages.about.title"),
    description: t("pages.about.metaDescription"),
  };
}

function AboutBodyEn(): JSX.Element {
  return (
    <>
      <p>
        hesalut lists local businesses so somebody looking for a plumber at
        nine on a Sunday evening can find one, see whether they are open, and
        get through to them. That is the whole product. The listing is not the
        end of the journey - the phone call is.
      </p>

      <h2>How a business gets listed</h2>
      <p>
        Anyone can <Link href="/register">add their business</Link>,
        free. Nothing appears in public search until it has passed two separate
        checks, and both have to clear:
      </p>
      <ul>
        <li>
          <strong>Listing review.</strong> A person reads what was submitted -
          the name, the category, the description - and approves or rejects it
          with a reason the owner can read.
        </li>
        <li>
          <strong>Business verification.</strong> The owner sends identity
          documents, and a reviewer confirms the business behind the listing is
          real.
        </li>
      </ul>
      <p>
        They are deliberately separate, because they can fail for different
        reasons and an owner needs to know which one is holding them up. A
        listing that has passed review but not verification is not in search,
        and its owner is told exactly that.
      </p>

      <h2>What the verified badge means</h2>
      <p>
        It means a reviewer looked at that business&apos;s documents and
        confirmed the business exists. It is not a rating, an endorsement, or a
        statement that the work will be good - only that the business is real.
        Because verification gates public search, every listing you can find
        through search has passed it.
      </p>

      <h2>Ratings and reviews</h2>
      <p>
        Reviews are written by people with accounts, one per business, and the
        business owner can reply once to each. Owners cannot delete reviews or
        review themselves. A business with no reviews shows as unrated rather
        than as zero stars - those are different things, and a directory that
        renders one as the other teaches people not to trust either.
      </p>

      <h2>What this does not do</h2>
      <p>
        It does not take bookings, process payments, sell goods, or stand
        between you and the business. When you contact somebody through this
        site, you are contacting them - we record that the enquiry happened so
        the owner can follow it up, and that is the extent of our involvement.
      </p>

      <h2>Still being built</h2>
      <p>
        This is an early-stage product and some of it is visibly unfinished:
        there are no listing photos yet, and business descriptions and reviews
        appear in the language they were written in. Where something is missing, the
        page says so rather than filling the gap with a placeholder.
      </p>
    </>
  );
}

function AboutBodyFr(): JSX.Element {
  return (
    <>
      <p>
        hesalut répertorie des entreprises locales pour qu’une personne qui
        cherche un plombier à 21 h un dimanche soir puisse en trouver un, voir
        s’il est ouvert et le joindre. C’est tout le produit. La fiche n’est pas
        la fin du parcours - l’appel, oui.
      </p>

      <h2>Comment une entreprise est inscrite</h2>
      <p>
        N’importe qui peut <Link href="/register">inscrire son entreprise</Link>,
        gratuitement. Rien n’apparaît dans la recherche publique avant d’avoir
        franchi deux vérifications distinctes, et les deux doivent être
        réussies :
      </p>
      <ul>
        <li>
          <strong>Examen de la fiche.</strong> Une personne lit ce qui a été
          soumis - le nom, la catégorie, la description - et l’approuve ou le
          refuse en donnant une raison que le propriétaire peut lire.
        </li>
        <li>
          <strong>Vérification de l’entreprise.</strong> Le propriétaire envoie
          des pièces d’identité, et un examinateur confirme que l’entreprise
          derrière la fiche existe réellement.
        </li>
      </ul>
      <p>
        Elles sont volontairement distinctes, parce qu’elles peuvent échouer
        pour des raisons différentes et qu’un propriétaire doit savoir laquelle
        le bloque. Une fiche qui a passé l’examen, mais pas la vérification,
        n’apparaît pas dans la recherche, et son propriétaire en est informé
        exactement en ces termes.
      </p>

      <h2>Ce que signifie le badge vérifié</h2>
      <p>
        Il signifie qu’un examinateur a consulté les documents de cette
        entreprise et confirmé qu’elle existe. Ce n’est ni une note, ni une
        recommandation, ni une garantie que le travail sera bien fait - seulement
        la confirmation que l’entreprise est réelle. Comme la vérification
        conditionne l’accès à la recherche publique, toutes les fiches que vous
        trouvez par la recherche l’ont réussie.
      </p>

      <h2>Notes et avis</h2>
      <p>
        Les avis sont rédigés par des personnes qui ont un compte, un par
        entreprise, et le propriétaire de l’entreprise peut répondre une fois à
        chacun. Les propriétaires ne peuvent ni supprimer des avis ni s’évaluer
        eux-mêmes. Une entreprise sans avis s’affiche comme non évaluée plutôt
        qu’avec zéro étoile - ce n’est pas la même chose, et un annuaire qui
        présente l’un comme l’autre apprend aux gens à ne se fier ni à l’un ni
        à l’autre.
      </p>

      <h2>Ce que le site ne fait pas</h2>
      <p>
        Il ne prend pas de réservations, ne traite pas de paiements, ne vend pas
        de biens et ne s’interpose pas entre vous et l’entreprise. Quand vous
        contactez quelqu’un par ce site, c’est bien cette personne que vous
        contactez - nous consignons que la demande a eu lieu pour que le
        propriétaire puisse y donner suite, et notre rôle s’arrête là.
      </p>

      <h2>En cours de construction</h2>
      <p>
        Ce produit en est à ses débuts, et certaines parties sont visiblement
        inachevées : il n’y a pas encore de photos sur les fiches, et les
        descriptions et les avis s’affichent dans la langue où ils ont été
        rédigés. Là où quelque chose manque, la page le dit
        plutôt que de combler le vide avec un contenu fictif.
      </p>
    </>
  );
}

export default function AboutPage(): JSX.Element {
  const locale = getLocale();
  const t = tFor(locale);
  return (
    <Prose
      title={t("pages.about.title")}
      lede={t("pages.about.lede")}
      updated="2026-09-10"
    >
      {locale === "fr" ? <AboutBodyFr /> : <AboutBodyEn />}
    </Prose>
  );
}
