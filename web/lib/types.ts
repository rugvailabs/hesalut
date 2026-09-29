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
  /** False only for a business account that has not finished registering. */
  is_active: boolean;
  /** 2-4 while registering (4 = complete); null if the account never did. */
  registration_step: number | null;
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
  | "newest"
  | "price";

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
  /** "$" to "$$$$"; null when the owner has not said. */
  price_range?: string | null;
  /** Same shape as BusinessDetail.opening_hours; null when not listed. */
  opening_hours?: Record<string, [string, string][]> | null;
  /** ISO timestamp the listing went up. */
  created_at?: string | null;
  /** Only present when the request supplied lat/lng. */
  distance_km: number | null;
  /**
   * Paid placement. Results arrive already ordered by it - Annual, Monthly
   * (rotating every 30 minutes), Basic, then no plan - and a paid position
   * must be labelled wherever the card is shown.
   */
  subscription_tier: SubscriptionTier;
  /** True for Annual subscribers. */
  is_featured: boolean;
  /** "⭐" for Annual, "📈" for Monthly, otherwise null. */
  featured_badge: string | null;
  /** "⭐ Featured" / "📈 Promoted", otherwise null. */
  badge: string | null;
  /** "Featured Business" / "Promoted Business", otherwise null. */
  badge_label: string | null;
  /** 1 Annual, 2 Monthly, 3 Basic; null without a live plan. */
  display_priority: number | null;
  /** 1-based place in the whole result set, across pages. */
  position: number;
  /** Monthly only: one of this half hour's three rotation leaders. */
  in_rotation: boolean;
  /** Why it sits here, e.g. "Annual subscriber (Featured), highest rated". */
  display_reason: string;
}

export type SubscriptionTier = "annual" | "monthly" | "basic" | "none";

/** GET /api/v1/businesses/search */
export interface SearchResponse {
  /** Identifies this page of results for click tracking; null when not logged. */
  search_id: string | null;
  items: BusinessListItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  has_next: boolean;
  has_prev: boolean;
}

/** GET /api/v1/businesses/cities - a city with public listings. */
export interface CityCount {
  city: string;
  province: string;
  business_count: number;
}

/** GET /api/v1/favorites - one saved listing. */
export interface Favorite {
  business_id: number;
  slug: string;
  name: string;
  category_slug: string;
  category_name: string;
  city: string;
  province: string;
  phone: string | null;
  rating: number | null;
  review_count: number;
  saved_at: string;
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
  /** false for internal lookups nobody sees, so they are not logged as impressions. */
  track?: boolean;
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

/* ------------------------------------------------------------- support */

/** Customer care, feedback and bug reports. Goes to us, not to a business. */
export type SupportKind = "enquiry" | "feedback" | "bug";

export interface SupportMessageCreate {
  kind: SupportKind;
  email: string;
  message: string;
  name?: string | null;
  subject?: string | null;
  /** Bug reports only. */
  page_url?: string | null;
  user_agent?: string | null;
}

/** Deliberately thin - only that it arrived, and a reference to quote. */
export interface SupportMessageAccepted {
  id: number;
  created_at: string;
}

/* --------------------------------------------------------------- admin */

/** A lead as the global admin inbox returns it - the row plus its listing. */
export interface AdminEnquiry extends EnquiryOut {
  business_name: string;
  business_slug: string;
}

/** GET /admin/enquiries */
export interface AdminEnquiryPage {
  items: AdminEnquiry[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

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
  /**
   * KYC submissions waiting on a reviewer. Separate from pending_listings:
   * they are two queues, cleared separately, and a listing can be waiting in
   * both at once.
   */
  pending_verifications: number;
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

/* ------------------------------------------------------- verification (KYC) */

/** Where a listing's KYC submission stands. */
export type VerificationStatus = "pending" | "verified" | "rejected";

/**
 * GET/POST /businesses/{id}/verification.
 *
 * Separate from the listing's own moderation `status`: one says a human read
 * the copy, the other says a human checked the business exists. A listing needs
 * both before it is publicly visible - see app/core/visibility.py.
 */
export interface BusinessVerification {
  id: number;
  business_id: number;
  email: string;
  mobile_number: string;
  license_number: string | null;
  license_document_url: string | null;
  gst_number: string | null;
  gst_document_url: string | null;
  status: VerificationStatus;
  /** Written by the reviewer, and shown to the owner. */
  rejection_reason: string | null;
  reviewed_at: string | null;
  submitted_at: string;
  updated_at: string;
}

/**
 * POST /businesses/{id}/verification body.
 *
 * Licence and GST are optional: not every trade is licensed, and a business
 * under the small-supplier threshold has no GST number. What is missing is the
 * reviewer's judgement, not a validation error.
 */
export interface VerificationSubmit {
  email: string;
  mobile_number: string;
  license_number?: string | null;
  license_document_url?: string | null;
  gst_number?: string | null;
  gst_document_url?: string | null;
}

/** GET /uploads/presign - where to PUT one document, and what to call it after. */
export interface PresignResponse {
  upload_url: string;
  /** The stable s3:// address that goes on the verification record. */
  document_url: string;
  key: string;
  expires_in: number;
  method: string;
  /** True when storage is unconfigured and these URLs are placeholders. */
  stub: boolean;
}

/**
 * A KYC submission as a reviewer sees it - GET /admin/verifications/pending
 * and /admin/verifications/{id}.
 *
 * Everything on BusinessVerification plus the listing it belongs to, so the
 * queue can be judged without opening each listing separately. `business_status`
 * is the listing's own moderation state: a reviewer needs to know whether
 * approving this is the last thing standing between the listing and search.
 */
export interface PendingVerificationItem extends BusinessVerification {
  business_name: string;
  business_slug: string;
  business_city: string;
  business_status: BusinessStatus;
  owner_email: string | null;
}

/* ------------------------------------------------ plans and subscriptions */

export type BillingCycle = "monthly" | "yearly";

export type SubscriptionStatus = "incomplete" | "active" | "past_due" | "canceled";

/** A line on a plan card. "coming_soon" is a paid perk that is not built yet. */
export interface PlanFeature {
  label: string;
  status: "included" | "coming_soon";
}

/** One row of GET /api/v1/plans, in display order. */
export interface Plan {
  id: number;
  name: string;
  /** One-line summary for the card. */
  description: string | null;
  /** Longer copy for the "Learn more" panel. */
  details: string | null;
  badge: string | null;
  /** Most important first; the card shows the first three. */
  features: PlanFeature[];
  benefits: string[];
  sort_order: number;
  billing_cycle: BillingCycle;
  /** A decimal string ("29.00"), never a float: it is money. */
  amount: string;
  currency: string;
  is_active: boolean;
}

/** GET /api/v1/businesses/{id}/subscription */
export interface Subscription {
  id: number;
  business_id: number;
  plan_id: number;
  status: SubscriptionStatus;
  current_period_end: string | null;
  canceled_at: string | null;
  created_at: string;
  plan: Plan;
}

/* ------------------------------------------------ business registration */

/** Step 1's business half. */
export interface RegistrationDetails {
  business_name: string;
  category_id: number;
  address: string | null;
  city: string;
  /** Two-letter code. Sales tax follows it. */
  province: string;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
}

/** POST /registration/start */
export interface RegistrationStartRequest extends RegistrationDetails {
  name: string;
  email: string;
  phone: string;
  password: string;
}

/** PUT /registration/details - email and password are not changed here. */
export interface RegistrationDetailsUpdate extends RegistrationDetails {
  name: string;
  phone: string;
}

export interface TaxLine {
  name: string;
  /** Percent as a decimal string: "13", "9.975". */
  rate: string;
  amount: string;
}

/** Priced server-side; what step 3 shows is what is charged. */
export interface OrderSummary {
  plan: Plan;
  currency: string;
  subtotal: string;
  tax_lines: TaxLine[];
  tax_total: string;
  total: string;
  province: string;
  requires_payment: boolean;
  /** "1 month" / "12 months"; null for a free plan. */
  period_label: string | null;
  /** When the plan would renew if paid now. */
  renews_on: string | null;
  /** Provincial taxes listed but not collected yet, e.g. "PST (7%)". */
  uncollected_taxes: string[];
}

export interface Receipt {
  receipt_number: string;
  created_at: string;
  currency: string;
  subtotal: string;
  tax_lines: TaxLine[];
  tax_total: string;
  total: string;
  province: string;
  card_brand: string | null;
  card_last4: string | null;
  /** "stub" for a test-mode payment, where no money moved. */
  gateway: string;
  gst_hst_registration_number: string | null;
}

/** GET /registration - everything needed to render or resume any step. */
export interface RegistrationState {
  /** The furthest step reached, 1-4. */
  step: number;
  completed: boolean;
  account: { name: string; email: string; phone: string | null };
  details: RegistrationDetails | null;
  selected_plan: Plan | null;
  order: OrderSummary | null;
  business: { id: number; name: string; slug: string; status: BusinessStatus } | null;
  subscription: Subscription | null;
  receipt: Receipt | null;
}

export interface RegistrationStarted {
  access_token: string;
  token_type: string;
  state: RegistrationState;
}

/** POST /registration/payment - test mode card. */
export interface RegistrationPaymentRequest {
  card_number: string;
  exp_month: number;
  exp_year: number;
  cvc: string;
  cardholder_name?: string | null;
  accept_terms: boolean;
}

/* ------------------------------------------------------ search analytics */

export type ClickAction = "view" | "call" | "enquire";

export interface TierPerformance {
  tier: SubscriptionTier;
  impressions: number;
  clicks: number;
  /** 0-1. */
  ctr: number;
  avg_position: number;
}

export interface RotationSubscriber {
  business_id: number;
  name: string;
  impressions: number;
  leader_impressions: number;
  /** Share of impressions spent in the top three, 0-1. */
  leader_share: number;
  clicks: number;
  ctr: number;
}

/** GET /admin/search-analytics */
export interface SearchAnalytics {
  days: number;
  tiers: TierPerformance[];
  rotation: {
    subscribers: RotationSubscriber[];
    /** Lowest leader share / highest, 0-1; null until there is enough data. */
    fairness: number | null;
    compared: number;
  };
  top_performers: {
    business_id: number;
    name: string;
    tier: SubscriptionTier;
    impressions: number;
    clicks: number;
    ctr: number;
  }[];
}

/** GET /businesses/{id}/search-performance */
export interface BusinessSearchPerformance {
  business_id: number;
  days: number;
  impressions: number;
  clicks: number;
  ctr: number;
  avg_position: number | null;
  clicks_by_action: Record<ClickAction, number>;
  impressions_by_tier: Partial<Record<SubscriptionTier, number>>;
  daily: { day: string; impressions: number; clicks: number }[];
}
