/**
 * Strings for the auth area. English is the source of truth for the keys;
 * the French must match it key for key (a missing key fails the type check).
 * Reached as t("auth.<key>") through lib/i18n.
 */

import type { Translated } from "@/lib/i18n/types";

export const authEn = {
  // app/login - signed out
  title: "Sign in",
  intro: "Use your email and password. Creating an account takes a moment.",
  // app/login - signed in but refused (?forbidden=1)
  forbidden: {
    ownersTitle: "This page is for business accounts",
    ownersBody:
      "You are signed in with a customer account. Register your business to turn it into a business account - you keep the same email and password.",
    title: "Not authorised",
    bodyBefore: "Your account does not have access to",
    thatPage: "that page",
    bodyAfter: ". Sign in with an administrator account to continue.",
    registerBusiness: "Register your business",
    home: "Home",
  },
  // components/LoginForm
  form: {
    modeGroup: "Sign in or create an account",
    modeSignIn: "Sign in",
    modeSignUp: "Create account",
    name: "Name",
    email: "Email",
    password: "Password",
    passwordHint: "At least 8 characters.",
    phone: "Mobile number",
    phoneHint:
      "How a business reaches you about an enquiry. You sign in with your email and password, never a code sent to this number.",
    listingBusiness: "Listing a business?",
    registerBusiness: "Register your business",
    listingBusinessAfter: "instead - it sets up your account, listing and plan together.",
    working: "Working…",
    submitSignIn: "Sign in",
    submitSignUp: "Create account",
    failed: "Sign-in failed (HTTP {status}).",
    unreachable: "Could not reach the server. Please try again.",
  },
  // components/LogoutButton
  signingOut: "Signing out…",
  signOut: "Sign out",
} as const;

export const authFr: Translated<typeof authEn> = {
  title: "Se connecter",
  intro: "Utilisez votre courriel et votre mot de passe. La création d’un compte ne prend qu’un instant.",
  forbidden: {
    ownersTitle: "Cette page est réservée aux comptes entreprise",
    ownersBody:
      "Vous êtes connecté avec un compte client. Inscrivez votre entreprise pour le transformer en compte entreprise - vous conservez le même courriel et le même mot de passe.",
    title: "Accès non autorisé",
    bodyBefore: "Votre compte n’a pas accès à",
    thatPage: "cette page",
    bodyAfter: ". Connectez-vous avec un compte administrateur pour continuer.",
    registerBusiness: "Inscrire mon entreprise",
    home: "Accueil",
  },
  form: {
    modeGroup: "Se connecter ou créer un compte",
    modeSignIn: "Se connecter",
    modeSignUp: "Créer un compte",
    name: "Nom",
    email: "Courriel",
    password: "Mot de passe",
    passwordHint: "Au moins 8 caractères.",
    phone: "Numéro de cellulaire",
    phoneHint:
      "Pour qu’une entreprise puisse vous joindre au sujet d’une demande. Vous vous connectez avec votre courriel et votre mot de passe, jamais avec un code envoyé à ce numéro.",
    listingBusiness: "Vous inscrivez une entreprise ?",
    registerBusiness: "Inscrivez votre entreprise",
    listingBusinessAfter: "plutôt - cela crée votre compte, votre fiche et votre forfait en une seule fois.",
    working: "Traitement…",
    submitSignIn: "Se connecter",
    submitSignUp: "Créer un compte",
    failed: "La connexion a échoué (HTTP {status}).",
    unreachable: "Impossible de joindre le serveur. Veuillez réessayer.",
  },
  signingOut: "Déconnexion…",
  signOut: "Se déconnecter",
};
