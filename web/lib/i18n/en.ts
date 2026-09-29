/**
 * English strings.
 *
 * This file is the source of truth for the key set: fr.ts is typed against it,
 * so a key added here and forgotten there is a compile error rather than a
 * French page with an English word in the middle of it.
 *
 * Only the shell is translated at this stage - header, footer, and the buttons
 * that appear on every page. Page bodies follow as each page is restyled.
 */

export const en = {
  common: {
    brand: "justforyou",
    tagline: "Find local businesses across Canada",
    search: "Search",
    searchPlaceholderWhat: "Plumbers, dentists, restaurants…",
    searchPlaceholderWhere: "City or postal code",
    nearMe: "Near me",
    signIn: "Sign in",
    signOut: "Sign out",
    dashboard: "Dashboard",
    messages: "Messages",
    admin: "Admin",
    browse: "Browse",
    explore: "Explore",
    listYourBusiness: "List your business",
    loading: "Loading…",
    retry: "Try again",
    cancel: "Cancel",
    close: "Close",
    openMenu: "Open menu",
    language: "Language",
  },
  listing: {
    showNumber: "Show number",
    enquire: "Enquire",
    call: "Call",
    directions: "Directions",
    website: "Website",
    verified: "Verified",
    verifiedHint: "Identity checked by our team",
    featured: "Featured",
    promoted: "Promoted",
    featuredLabel: "Featured Business",
    promotedLabel: "Promoted Business",
    featuredCaption: "Paid placement",
    promotedCaption: "Paid placement · businesses take turns at the top every 30 minutes",
    moreBusinesses: "More businesses",
    viewDetails: "View details",
    featuredHint: "Featured Business - paid placement on the Annual plan",
    promotedHint: "Promoted Business - paid placement on the Monthly plan",
    placementNote:
      "⭐ Featured and 📈 Promoted businesses pay for higher placement. Within each group, results follow your sort.",
    open: "Open now",
    closed: "Closed",
    closesAt: "Closes {time}",
    opensAt: "Opens {time}",
    opensDay: "Opens {day} {time}",
    noHours: "Hours not listed",
    noReviews: "No reviews yet",
    reviews: "{count} reviews",
    oneReview: "1 review",
    away: "{distance} away",
  },
  business: {
    home: "Home",
    about: "About",
    hours: "Opening hours",
    hoursToday: "Today",
    closedDay: "Closed",
    location: "Location",
    notMapped: "This listing has no coordinates, so it cannot be mapped.",
    openInMaps: "Open in Google Maps",
    contact: "Contact",
    phone: "Phone",
    phoneHidden: "Use “Show number”",
    email: "Email",
    whatsapp: "WhatsApp",
    website: "Website",
    category: "Category",
    priceRange: "Price range",
    services: "Services",
    notListed: "Not listed",
    noPhone: "No phone number listed",
    startChat: "Start chat",
    moreIn: "More in {category}",
    reviewsHeading: "Reviews",
    ratingBreakdown: "Rating breakdown",
    starCount: "{stars} stars",
    oneStar: "1 star",
    noReviewsTitle: "No reviews yet",
    noReviewsBody: "Nobody has reviewed {name} through this directory yet.",
    ownerReply: "Response from {name}",
    enquireHeading: "Request a callback or quote",
    enquireOpen: "Request a callback or quote",
    enquireContact: "Contact {name}",
    enquireSent: "Enquiry sent",
    enquireSentBody: "{name} has your request and can see your contact details.",
    kindCallback: "Request a callback",
    kindQuote: "Request a quote",
    fieldMessage: "Message",
    fieldMessagePlaceholder: "Describe what you need…",
    fieldName: "Your name",
    fieldPhone: "Phone",
    fieldEmail: "Email",
    signedInHint: "If you are signed in, your account details fill any field you leave blank.",
    send: "Send",
    sending: "Sending…",
    sendFailed: "Could not reach the server. Please try again.",
    photosTitle: "No photos yet",
    photosBody: "This directory has no photo storage for listings, so none is shown rather than a stock image standing in for a real storefront.",
  },
  footer: {
    forCustomers: "For customers",
    forBusinesses: "For businesses",
    company: "Company",
    browseCategories: "Browse categories",
    howItWorks: "How it works",
    addListing: "Add your business",
    pricing: "Pricing",
    ownerSignIn: "Business sign-in",
    about: "About",
    privacy: "Privacy",
    terms: "Terms",
    accessibility: "Accessibility",
    contact: "Contact us",
    feedback: "Send feedback",
    reportBug: "Report a bug",
    freeListing: "Free listing",
    businessBadge: "Verified badge",
    support: "Support",
    legal: "Legal",
    rights: "All rights reserved.",
    madeIn: "Built in Canada. Prices in CAD.",
  },
  empty: {
    noResults: "No listings match that",
    noResultsBody: "Try a broader search, or clear a filter or two.",
    clearFilters: "Clear filters",
  },
} as const;

/**
 * The shape every locale must fill.
 *
 * `as const` above gives each English string a literal type, which is what
 * makes a mistyped key a compile error - but it would also demand that the
 * French file repeat the English words. This widens the leaves back to
 * `string` while keeping the key structure exact, so fr.ts must supply every
 * key and may supply any text.
 */
type Translated<T> = {
  [K in keyof T]: T[K] extends string ? string : Translated<T[K]>;
};

export type Dictionary = Translated<typeof en>;
