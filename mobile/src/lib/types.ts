/**
 * TypeScript mirrors of the backend's Pydantic schemas.
 *
 * Source of truth is http://localhost:8000/openapi.json (FastAPI, title
 * "justforyou"). Names here match the backend's schema names exactly so the
 * two can be diffed by eye when the API changes.
 */

/* ------------------------------------------------------------------ enums */

/** app/models/user.py - how a user wants to be contacted. */
export type PreferredContactMethod = "email" | "sms" | "phone";

export type ConsentType = "record_audio" | "send_email" | "send_sms";

/** How the caller described their problem. */
export type InputType = "text" | "audio";

export type SubmissionStatus =
  | "SUBMITTED"
  | "UPLOADED"
  | "TRANSCRIBED"
  | "EXTRACTED"
  | "MATCHED"
  | "SENT"
  | "SOLVED"
  | "APPROVED"
  | "NEEDS_REVIEW";

/* ------------------------------------------------------------------- auth */

/** POST /api/v1/signup */
export interface SignupRequest {
  /** 1-255 chars. */
  name: string;
  email: string;
  /** 8-72 chars - bcrypt truncates beyond 72 bytes. */
  password: string;
  /** Optional, max 32 chars. */
  phone?: string | null;
  /** Defaults to "email" server-side. */
  preferred_contact_method?: PreferredContactMethod;
  /**
   * Self-service signup role. The API accepts only these two - "admin" is
   * rejected with a 422, so signup cannot be used to escalate.
   */
  role?: "customer" | "business_owner";
}

/** POST /api/v1/login */
export interface LoginRequest {
  email: string;
  password: string;
}

/**
 * Returned by both /signup and /login.
 *
 * NOTE: the backend issues a single access token and no refresh token, so
 * there is no `TokenPair` to model. The JWT expires 60 minutes after issue
 * (ACCESS_TOKEN_EXPIRE_MINUTES in app/core/security.py); when it lapses the
 * user signs in again.
 */
export interface TokenResponse {
  access_token: string;
  /** Always "bearer". */
  token_type?: string;
}

/** GET /api/v1/me - the authenticated user. */
export interface UserResponse {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  preferred_contact_method: PreferredContactMethod;
  /** Admin flag. Still the authority for the submission review console. */
  is_admin: boolean;
  /** Broader role. Neither this nor is_admin is a JWT claim - both come from /me. */
  role: UserRole;
  /** ISO-8601 timestamp. */
  created_at: string;
}

/**
 * Claims actually present in the JWT, per app/core/security.py.
 *
 * `create_access_token` is called as `create_access_token({"sub": str(user.id)})`
 * and adds only `exp` and `iat`. There is deliberately no role/is_admin claim -
 * authorisation comes from GET /api/v1/me.
 */
export interface AccessTokenClaims {
  /** The user id, as a string (RFC 7519 requires `sub` to be a string). */
  sub: string;
  /** Expiry, seconds since epoch. */
  exp: number;
  /** Issued-at, seconds since epoch. */
  iat: number;
}

/* --------------------------------------------------------------- consents */

export interface ConsentResponse {
  id: number;
  consent_type: ConsentType;
  granted: boolean;
  policy_version: string;
  granted_at: string | null;
  revoked_at: string | null;
}

export interface ConsentGrantRequest {
  consent_type: ConsentType;
  policy_version: string;
}

/* ------------------------------------------------------------- API errors */

/** FastAPI's error envelope: `{"detail": ...}`. */
export interface ApiErrorPayload {
  detail?: unknown;
  [key: string]: unknown;
}

/** One entry of a 422 validation error from FastAPI. */
export interface ValidationErrorItem {
  loc: (string | number)[];
  msg: string;
  type: string;
}

/* -------------------------------------------------------------- directory */

/** Ordering accepted by /businesses/search. */
export type BusinessSort =
  | "relevance"
  | "rating"
  | "reviews"
  | "distance"
  | "name"
  | "newest";

/** GET /api/v1/categories */
export interface Category {
  id: number;
  name: string;
  slug: string;
  /** null for a root category. The taxonomy supports nesting; the seed is flat. */
  parent_id: number | null;
  description: string | null;
  /** Emoji rendered by the category grid. */
  icon: string | null;
  /** Active listings directly in this category. */
  business_count: number;
}

/** One row of GET /api/v1/businesses/search */
export interface BusinessListItem {
  id: number;
  name: string;
  slug: string;
  category_slug: string;
  category_name: string;
  description: string | null;
  address: string | null;
  city: string;
  province: string;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  website: string | null;
  /** null means "no reviews yet" - render that, not zero stars. */
  rating: number | null;
  review_count: number;
  verified: boolean;
  /** "none", "external" (the owner's own booking page) or "request" (requests on the site). */
  booking_mode?: "none" | "external" | "request";
  /** Whether a visitor can book this business; drives the "Bookable" badge. */
  bookable?: boolean;
  /** Only present when the request supplied lat/lng. */
  distance_km: number | null;
}

/** GET /api/v1/businesses/search */
export interface SearchResponse {
  items: BusinessListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

/**
 * GET /api/v1/search/understand - plain-language text turned into filters.
 *
 * `source: "keywords"` means the model was unavailable and nothing was
 * extracted: search the text exactly as typed and ignore the other fields.
 */
export interface SearchUnderstanding {
  source: "ai" | "keywords";
  category_slugs: string[];
  cities: string[];
  postal_code: string | null;
  near_me: boolean;
  hours: ("open_now" | "weekends" | "evenings")[];
  rating_bands: ("5" | "4.5" | "4" | "3")[];
  price_levels: ("$" | "$$" | "$$$" | "$$$$")[];
  /** They asked for businesses they can book online. Absent from an older API. */
  bookable?: boolean;
  /** What is left once the filters are taken out; becomes `q`. */
  keywords: string | null;
  /** Asked-for things that cannot be filtered on yet, in the query's language. */
  unsupported: string[];
  /** Short description of the filters, e.g. "Plumbers in Burnaby, open now". */
  summary: string;
}

/** Query parameters accepted by searchBusinesses(). */
export interface BusinessSearchParams {
  q?: string;
  /** Several values mean any of them. */
  category_slug?: string | string[];
  city?: string | string[];
  /** Rating bands: "5", "4.5" (4.5-4.99), "4" (4-4.49), "3" (3-3.99). Any of them. */
  rating_band?: string[];
  /** open_now, weekends, evenings. Every one given must hold. */
  hours?: string[];
  /** "$" to "$$$$". Any of them. */
  price?: string[];
  /** true: only businesses that can be booked (requests on the site, or the owner's own link). */
  bookable?: boolean;
  /** A postal code or its start ("V6B"); spaces are ignored. */
  postal_code?: string;
  /** lat and lng must be supplied together; the API 422s otherwise. */
  lat?: number;
  lng?: number;
  /** Requires lat/lng. Max 500. */
  radius_km?: number;
  min_rating?: number;
  sort?: BusinessSort;
  page?: number;
  /** 1-50, default 20. */
  page_size?: number;
}

/* ------------------------------------------------------- owner dashboard */

/** Moderation state. Only `approved` is publicly visible. */
export type BusinessStatus = "pending" | "approved" | "rejected" | "suspended";

/**
 * What a user may do beyond acting for themselves.
 *
 * Coexists with `is_admin` on UserResponse rather than replacing it: the
 * submission review console still gates on that boolean.
 */
export type UserRole = "customer" | "business_owner" | "admin";

/** A listing as its owner sees it - GET /businesses/owner/mine */
export interface BusinessOwnerItem {
  id: number;
  name: string;
  slug: string;
  category_id: number;
  status: BusinessStatus;
  city: string;
  province: string;
  address: string | null;
  rating: number | null;
  review_count: number;
  is_active: boolean;
  verified: boolean;
  /** Why a listing was rejected or suspended. Written by a moderator. */
  moderation_note: string | null;
  moderated_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Full listing - GET /businesses/{id} (owner) and /businesses/by-slug/{slug}. */
export interface BusinessDetail extends BusinessOwnerItem {
  description: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  price_range: string | null;
  tags: string[] | null;
  opening_hours: Record<string, [string, string][]> | null;
  owner_id: number | null;
  category_slug: string | null;
  category_name: string | null;
}

/**
 * POST /businesses body.
 *
 * No status, owner_id, rating or verified: the server assigns those, and
 * accepting them from a client would be self-approval.
 */
export interface BusinessCreate {
  name: string;
  category_id: number;
  description?: string | null;
  address?: string | null;
  city: string;
  province?: string;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  phone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  website?: string | null;
  price_range?: string | null;
  tags?: string[] | null;
  opening_hours?: Record<string, [string, string][]> | null;
}

/** PATCH /businesses/{id} body. Omitted fields are left alone. */
export type BusinessUpdate = Partial<BusinessCreate> & { is_active?: boolean };

/* ------------------------------------------------------------- enquiries */

/**
 * What the customer did. `call_click` carries no message - it records that
 * someone revealed the phone number, which is the closest signal of intent a
 * directory can observe without the call itself.
 */
export type EnquiryType = "call_click" | "callback" | "quote" | "chat";

/** POST /businesses/{id}/enquiries body. Anonymous callers are allowed. */
export interface EnquiryCreate {
  enquiry_type: EnquiryType;
  message?: string | null;
  contact_name?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
}

/** A lead as its owner sees it - GET /businesses/{id}/enquiries. */
export interface EnquiryOut {
  id: number;
  business_id: number;
  enquiry_type: EnquiryType;
  message: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  /** Present when the enquiry came from a signed-in customer. */
  user_id: number | null;
  created_at: string;
}

/** Thin ack from the public POST - it never echoes the stored lead back. */
export interface EnquiryAck {
  id: number;
  created_at: string;
}

/* --------------------------------------------------------------- reviews */

/**
 * A customer review of a listing, with the owner's optional reply.
 *
 * Note this is unrelated to the backend's ReviewDetail/ReviewStats schemas,
 * which belong to the voice-submission moderation console.
 */
export interface BusinessReview {
  id: number;
  business_id: number;
  rating: number;
  title: string | null;
  body: string | null;
  /** null when the owner has not replied. One reply per review. */
  owner_reply: string | null;
  owner_replied_at: string | null;
  created_at: string;
  author_id: number;
  /** Display name only - reviewer emails are never exposed publicly. */
  author_name: string;
}

/** GET /businesses/{id}/reviews/summary */
export interface BusinessReviewSummary {
  average_rating: number | null;
  review_count: number;
  /** rating value -> count, for the 5..1 histogram. */
  breakdown: Record<string, number>;
}

/** POST /businesses/{id}/reviews body. */
export interface BusinessReviewCreate {
  rating: number;
  title?: string | null;
  body?: string | null;
}

/* ------------------------------------------------------------- moderation */

/** A listing as the moderator sees it, with enough context to decide. */
export interface ModerationQueueItem {
  id: number;
  name: string;
  slug: string;
  status: BusinessStatus;
  city: string;
  province: string;
  address: string | null;
  description: string | null;
  phone: string | null;
  website: string | null;
  category_name: string;
  owner_id: number | null;
  /** Admin-only surface; never rendered on a public page. */
  owner_email: string | null;
  moderation_note: string | null;
  moderated_at: string | null;
  created_at: string;
}

export interface ModerationStats {
  pending: number;
  approved: number;
  rejected: number;
  suspended: number;
}

/** Verb applied to a listing. `approve` works from any status, so it also reinstates. */
export type ModerationAction = "approve" | "reject" | "suspend";

/* ------------------------------------------------------------------ chat */

/** One message in a thread. */
export interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  sender_name: string;
  /** Resolved server-side against the caller, so the UI needn't compare ids. */
  mine: boolean;
  body: string;
  created_at: string;
}

/**
 * A thread as one participant sees it.
 *
 * Viewer-relative: `other_party_name` and `unread` mean different things to
 * the customer and the owner, which is what lets one component serve both.
 */
export interface Conversation {
  id: number;
  business_id: number;
  business_name: string;
  business_slug: string;
  customer_id: number;
  my_role: "customer" | "owner";
  other_party_name: string;
  last_message_at: string;
  last_message_preview: string | null;
  unread: number;
  created_at: string;
}

export interface ConversationDetail extends Conversation {
  messages: ChatMessage[];
}

/* ----------------------------------------------------------- profile */

/**
 * PATCH /profile body. Every field optional; omitted fields are left alone,
 * while an explicit null clears one.
 *
 * Note the API accepts only these three. Email is immutable (it is the login
 * identity) and role is not self-assignable.
 */
export interface ProfileUpdate {
  name?: string;
  phone?: string | null;
  preferred_contact_method?: PreferredContactMethod;
}

/* --------------------------------------------------------------- admin */

export interface AdminStats {
  total_businesses: number;
  pending_listings: number;
  approved_listings: number;
  rejected_listings: number;
  suspended_listings: number;
  total_users: number;
  total_reviews: number;
  total_enquiries: number;
  total_conversations: number;
}

/**
 * A review as a moderator sees it. Carries the author's email, which the
 * public list withholds - moderating means knowing who wrote something.
 */
export interface AdminReviewItem {
  id: number;
  business_id: number;
  business_name: string;
  business_slug: string;
  rating: number;
  title: string | null;
  body: string | null;
  owner_reply: string | null;
  author_id: number;
  author_name: string;
  author_email: string;
  created_at: string;
}
