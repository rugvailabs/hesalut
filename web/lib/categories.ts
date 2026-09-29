/**
 * Category display names in both site languages.
 *
 * The API only knows English names, so French lives here, keyed by slug - the
 * identity the rest of the app routes on. English deliberately comes from the
 * API rather than this map, so a name edited in the admin still shows; the
 * `en` column exists for matching typed text in either language.
 */

import { type Locale } from "@/lib/i18n";

export const CATEGORY_NAMES: Record<string, { en: string; fr: string }> = {
  plumbers: { en: "Plumbers", fr: "Plombiers" },
  electricians: { en: "Electricians", fr: "Électriciens" },
  restaurants: { en: "Restaurants", fr: "Restaurants" },
  dentists: { en: "Dentists", fr: "Dentistes" },
  "auto-repair": { en: "Auto Repair", fr: "Réparation automobile" },
  gyms: { en: "Gyms & Fitness", fr: "Centres de conditionnement physique" },
  salons: { en: "Salons & Spas", fr: "Salons de coiffure et spas" },
  movers: { en: "Movers & Storage", fr: "Déménagement et entreposage" },
  "it-support": { en: "IT Support", fr: "Soutien informatique" },
  legal: { en: "Legal Services", fr: "Services juridiques" },
  hotels: { en: "Hotels & Stays", fr: "Hôtels et hébergement" },
  "car-rentals": { en: "Car Rentals", fr: "Location de voitures" },
  hvac: { en: "Heating & Cooling", fr: "Chauffage et climatisation" },
  roofing: { en: "Roofing", fr: "Toitures" },
  cleaning: { en: "Cleaning Services", fr: "Services de nettoyage" },
  "pest-control": { en: "Pest Control", fr: "Extermination" },
  painters: { en: "Painters", fr: "Peintres" },
  landscaping: { en: "Landscaping & Gardening", fr: "Aménagement paysager et jardinage" },
  locksmiths: { en: "Locksmiths", fr: "Serruriers" },
  handyman: { en: "Handyman Services", fr: "Services d’homme à tout faire" },
  "appliance-repair": { en: "Appliance Repair", fr: "Réparation d’électroménagers" },
  renovation: { en: "Renovation & Contractors", fr: "Rénovation et entrepreneurs" },
  flooring: { en: "Flooring", fr: "Revêtements de sol" },
  "windows-doors": { en: "Windows & Doors", fr: "Portes et fenêtres" },
  "walk-in-clinics": { en: "Doctors & Walk-in Clinics", fr: "Médecins et cliniques sans rendez-vous" },
  pharmacies: { en: "Pharmacies", fr: "Pharmacies" },
  physiotherapy: { en: "Physiotherapy", fr: "Physiothérapie" },
  chiropractors: { en: "Chiropractors", fr: "Chiropraticiens" },
  optometrists: { en: "Optometrists", fr: "Optométristes" },
  "massage-therapy": { en: "Massage Therapy (RMT)", fr: "Massothérapie" },
  counselling: { en: "Counselling & Mental Health", fr: "Consultation et santé mentale" },
  veterinarians: { en: "Veterinarians", fr: "Vétérinaires" },
  "cafes-bakeries": { en: "Cafés & Bakeries", fr: "Cafés et boulangeries" },
  grocery: { en: "Grocery Stores", fr: "Épiceries" },
  caterers: { en: "Caterers", fr: "Traiteurs" },
  "car-wash": { en: "Car Wash & Detailing", fr: "Lave-autos et esthétique automobile" },
  towing: { en: "Towing", fr: "Remorquage" },
  "driving-schools": { en: "Driving Schools", fr: "Écoles de conduite" },
  tutoring: { en: "Tutoring", fr: "Tutorat" },
  childcare: { en: "Daycare & Childcare", fr: "Garderies et services de garde" },
  "music-lessons": { en: "Music Lessons", fr: "Cours de musique" },
  accountants: { en: "Accountants & Tax", fr: "Comptables et impôts" },
  "real-estate": { en: "Real Estate Agents", fr: "Courtiers immobiliers" },
  insurance: { en: "Insurance Brokers", fr: "Courtiers d’assurance" },
  immigration: { en: "Immigration Consultants", fr: "Consultants en immigration" },
  notaries: { en: "Notaries", fr: "Notaires" },
  translators: { en: "Translation Services", fr: "Services de traduction" },
  photographers: { en: "Photographers", fr: "Photographes" },
  "event-planners": { en: "Event Planners", fr: "Planificateurs d’événements" },
  "print-copy": { en: "Print & Copy", fr: "Impression et photocopie" },
  barbers: { en: "Barbers", fr: "Barbiers" },
  tailors: { en: "Tailors & Alterations", fr: "Couture et retouches" },
  "dry-cleaners": { en: "Dry Cleaners", fr: "Nettoyeurs" },
  "pet-grooming": { en: "Pet Grooming", fr: "Toilettage d’animaux" },
  "device-repair": { en: "Phone & Computer Repair", fr: "Réparation de téléphones et d’ordinateurs" },
  "bike-shops": { en: "Bike Shops", fr: "Boutiques de vélos" },
};

/**
 * The name to show for a category. `fallback` is the API's (English) name:
 * it wins in English, and for any slug this map does not know yet.
 */
export function categoryName(slug: string | null | undefined, fallback: string, locale: Locale): string {
  if (locale === "en" || !slug) return fallback;
  return CATEGORY_NAMES[slug]?.fr ?? fallback;
}

/**
 * The same, for the few payloads that carry only the English name and no slug
 * (the moderation queue). Matched against this map's English column, so a
 * name edited in the admin simply stays English until the map catches up.
 */
export function categoryNameFromEnglish(name: string, locale: Locale): string {
  if (locale === "en") return name;
  for (const known of Object.values(CATEGORY_NAMES)) {
    if (known.en === name) return known.fr;
  }
  return name;
}

/** Every name a category answers to, for matching typed text in either language. */
export function categoryNames(slug: string, fallback: string): string[] {
  const known = CATEGORY_NAMES[slug];
  return known ? [fallback, known.en, known.fr] : [fallback];
}

/** Lower-case and strip accents, so "electr" finds "Électriciens". */
export function foldAccents(text: string): string {
  return text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/** A-Z grouping key for a display name: "Épiceries" files under E. */
export function categoryLetter(name: string): string {
  return foldAccents(name.trim()[0] ?? "").toUpperCase();
}
