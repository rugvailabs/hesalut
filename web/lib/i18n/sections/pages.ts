/**
 * Strings for the pages area. English is the source of truth for the keys;
 * the French must match it key for key (a missing key fails the type check).
 * Reached as t("pages.<key>") through lib/i18n.
 *
 * Only the short strings live here - titles, ledes, metadata, the Prose
 * chrome and the support form. The long bodies of /about, /contact, /privacy
 * and /terms are written as one English and one French JSX component in each
 * page file, because prose split into hundreds of one-sentence keys cannot be
 * read or reviewed as prose.
 */

import type { Translated } from "@/lib/i18n/types";

export const pagesEn = {
  prose: {
    home: "Home",
    lastUpdated: "Last updated {date}",
    unclear: "Something here unclear or wrong?",
    tellUs: "Tell us",
  },
  about: {
    title: "About",
    lede: "A directory of Canadian businesses that people can actually reach.",
    metaDescription:
      "What hesalut is, how listings get in, and what the verified badge means.",
  },
  contact: {
    title: "Contact us",
    lede: "A question, something you think we got wrong, or something plainly broken - all three land in the same place.",
    metaDescription:
      "Ask a question, send feedback, or report a bug. We reply by email.",
  },
  privacy: {
    title: "Privacy policy",
    lede: "What we collect, why we have it, and how to make us delete it.",
    metaDescription:
      "What hesalut collects, why, how long it is kept, and how to get it deleted.",
  },
  terms: {
    title: "Terms of use",
    lede: "What you can expect from this directory, and what we expect from you.",
    metaDescription:
      "The rules for using hesalut, for visitors and for business owners.",
  },
  support: {
    kinds: {
      enquiry: {
        label: "A question",
        blurb: "Something about your account, a listing, or how the directory works.",
      },
      feedback: {
        label: "Feedback",
        blurb: "What is working, what is not, and what you wish this did.",
      },
      bug: {
        label: "A bug",
        blurb: "Something is broken. The more precisely you can say what, the better.",
      },
    },
    kindLabel: "What is this about?",
    optional: "(optional)",
    nameLabel: "Your name",
    emailLabel: "Email",
    emailHint: "Where we reply.",
    subjectLabel: "Subject",
    messageLabel: "Message",
    bugMessageLabel: "What happened?",
    bugPlaceholder: "What you did, what you expected, and what happened instead.",
    charCount: "{count} of {max} characters",
    charLimit: "Up to {max} characters.",
    pageLabel: "Which page?",
    pagePlaceholder: "Paste the address of the page it happened on",
    browserLabel: "Your browser",
    notDetected: "Not detected.",
    browserHint: "Sent with this report so we can reproduce it.",
    send: "Send",
    sending: "Sending…",
    httpError: "Could not send that (HTTP {status}).",
    networkError: "Could not reach the server. Please try again.",
    sentTitle: "Thanks — that reached us",
    sentReference: "Your reference is",
    sentReply: "We reply to the address you gave.",
  },
} as const;

export const pagesFr: Translated<typeof pagesEn> = {
  prose: {
    home: "Accueil",
    lastUpdated: "Dernière mise à jour : {date}",
    unclear: "Quelque chose ici est flou ou erroné ?",
    tellUs: "Dites-le-nous",
  },
  about: {
    title: "À propos",
    lede: "Un annuaire d’entreprises canadiennes qu’on peut réellement joindre.",
    metaDescription:
      "Ce qu’est hesalut, comment les fiches y sont inscrites et ce que signifie le badge vérifié.",
  },
  contact: {
    title: "Nous joindre",
    lede: "Une question, quelque chose que nous avons mal fait selon vous, ou quelque chose de carrément brisé - les trois arrivent au même endroit.",
    metaDescription:
      "Posez une question, envoyez un commentaire ou signalez un problème. Nous répondons par courriel.",
  },
  privacy: {
    title: "Politique de confidentialité",
    lede: "Ce que nous recueillons, pourquoi nous le détenons et comment nous obliger à le supprimer.",
    metaDescription:
      "Ce que hesalut recueille, pourquoi, combien de temps c’est conservé et comment le faire supprimer.",
  },
  terms: {
    title: "Conditions d’utilisation",
    lede: "Ce que vous pouvez attendre de cet annuaire, et ce que nous attendons de vous.",
    metaDescription:
      "Les règles d’utilisation de hesalut, pour les visiteurs et pour les propriétaires d’entreprise.",
  },
  support: {
    kinds: {
      enquiry: {
        label: "Une question",
        blurb: "Une question sur votre compte, une fiche ou le fonctionnement de l’annuaire.",
      },
      feedback: {
        label: "Un commentaire",
        blurb: "Ce qui fonctionne, ce qui ne fonctionne pas et ce que vous aimeriez que le site fasse.",
      },
      bug: {
        label: "Un bogue",
        blurb: "Quelque chose ne fonctionne pas. Plus vous pouvez préciser quoi, mieux c’est.",
      },
    },
    kindLabel: "De quoi s’agit-il ?",
    optional: "(facultatif)",
    nameLabel: "Votre nom",
    emailLabel: "Courriel",
    emailHint: "L’adresse où nous vous répondrons.",
    subjectLabel: "Objet",
    messageLabel: "Message",
    bugMessageLabel: "Que s’est-il passé ?",
    bugPlaceholder: "Ce que vous avez fait, ce à quoi vous vous attendiez et ce qui s’est passé à la place.",
    charCount: "{count} caractères sur {max}",
    charLimit: "Jusqu’à {max} caractères.",
    pageLabel: "Quelle page ?",
    pagePlaceholder: "Collez l’adresse de la page où c’est arrivé",
    browserLabel: "Votre navigateur",
    notDetected: "Non détecté.",
    browserHint: "Envoyé avec ce signalement pour que nous puissions reproduire le problème.",
    send: "Envoyer",
    sending: "Envoi…",
    httpError: "Impossible d’envoyer ce message (HTTP {status}).",
    networkError: "Impossible de joindre le serveur. Veuillez réessayer.",
    sentTitle: "Merci — votre message nous est parvenu",
    sentReference: "Votre numéro de référence est",
    sentReply: "Nous répondons à l’adresse que vous avez indiquée.",
  },
};
