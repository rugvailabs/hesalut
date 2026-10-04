/**
 * Typed fetch wrapper around the FastAPI backend.
 *
 * SERVER-SIDE ONLY. Two reasons, both structural:
 *
 *   1. The backend mounts no CORSMiddleware (verified: an OPTIONS preflight to
 *      /api/v1/login returns 405 with no access-control-allow-origin header),
 *      so a browser on :3000 cannot call :8000 directly.
 *   2. The JWT lives in an httpOnly cookie, which client JavaScript cannot
 *      read by design.
 *
 * Call it from Server Components, Server Actions and route handlers. Client
 * components reach the API through our own route handlers instead.
 */

import { ACCESS_TOKEN_COOKIE } from "@/lib/cookies";
import type {
  AdminReviewItem,
  AdminStats,
  ApiErrorPayload,
  BusinessCreate,
  BusinessDetail,
  BusinessListItem,
  BusinessOwnerItem,
  BusinessReview,
  BusinessReviewCreate,
  BusinessReviewSummary,
  BusinessSearchParams,
  BusinessSearchPerformance,
  ClickAction,
  BusinessStatus,
  BusinessUpdate,
  BusinessVerification,
  Category,
  CityCount,
  ChatMessage,
  Conversation,
  ConversationDetail,
  EnquiryAck,
  EnquiryCreate,
  EnquiryOut,
  EnquiryType,
  Favorite,
  ModerationAction,
  ModerationQueueItem,
  ModerationStats,
  PendingVerificationItem,
  Plan,
  RegistrationDetailsUpdate,
  RegistrationPaymentRequest,
  RegistrationStarted,
  RegistrationStartRequest,
  RegistrationState,
  PresignResponse,
  ProfileUpdate,
  SearchAnalytics,
  LoginRequest,
  AdminEnquiryPage,
  SearchResponse,
  SearchUnderstanding,
  BookableService,
  Booking,
  BookingAction,
  BookingCreate,
  BookingInfo,
  ServiceInput,
  SupportMessageAccepted,
  SupportMessageCreate,
  SignupRequest,
  TokenResponse,
  UserResponse,
  ValidationErrorItem,
  VerificationSubmit,
} from "@/lib/types";

/** Trailing slash trimmed so `${API_BASE_URL}${path}` never doubles up. */
export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1"
).replace(/\/+$/, "");

/* ------------------------------------------------------------------ errors */

export class ApiError extends Error {
  readonly status: number;
  readonly payload: ApiErrorPayload | null;
  /** Set when the body was not JSON at all; holds a truncated copy. */
  readonly rawBody: string | null;

  constructor(
    status: number,
    message: string,
    payload: ApiErrorPayload | null = null,
    rawBody: string | null = null,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
    this.rawBody = rawBody;
  }

  /** No token, or the token expired / was rejected. */
  get isUnauthorized(): boolean {
    return this.status === 401;
  }

  /** Authenticated, but not allowed - e.g. a non-admin hitting /review. */
  get isForbidden(): boolean {
    return this.status === 403;
  }

  /** Signup against an email that already exists. */
  get isConflict(): boolean {
    return this.status === 409;
  }

  /** FastAPI request-validation failure. */
  get isValidationError(): boolean {
    return this.status === 422;
  }

  /** The network never reached the backend. */
  get isNetworkError(): boolean {
    return this.status === 0;
  }
}

/**
 * Turn FastAPI's `detail` into one human sentence.
 *
 * `detail` is a plain string for HTTPException, but a list of
 * {loc, msg, type} objects for a 422. Both shapes reach here.
 */
function messageFromPayload(
  status: number,
  payload: ApiErrorPayload | null,
): string {
  const detail = payload?.detail;

  if (typeof detail === "string" && detail.trim() !== "") return detail;

  if (Array.isArray(detail)) {
    const parts = (detail as ValidationErrorItem[])
      .map((item) => {
        // Drop the leading "body"/"query" segment - it means nothing to a user.
        const field = Array.isArray(item?.loc)
          ? item.loc.filter((s) => s !== "body" && s !== "query").join(".")
          : "";
        return field ? `${field}: ${item?.msg ?? ""}` : (item?.msg ?? "");
      })
      .filter(Boolean);
    if (parts.length > 0) return parts.join("; ");
  }

  if (status === 0) return "Could not reach the server. Is the backend running?";
  if (status >= 500) return "The server hit an error. Please try again shortly.";
  return `Request failed (HTTP ${status}).`;
}

/* ----------------------------------------------------------------- request */

export interface ApiFetchOptions extends Omit<RequestInit, "body"> {
  /** Serialised as JSON. Use `rawBody` for FormData and friends. */
  body?: unknown;
  /** Escape hatch for multipart uploads; passed through untouched. */
  rawBody?: BodyInit;
  /**
   * Attach the JWT. Defaults to true. When no `token` is supplied the cookie
   * jar is read, so this only works inside a request scope.
   */
  auth?: boolean;
  /** Use this token instead of the cookie - e.g. one just returned by /login. */
  token?: string;
}

/** Read the JWT from the httpOnly cookie, if we're inside a request scope. */
async function tokenFromCookie(): Promise<string | undefined> {
  // Imported lazily: a static import of next/headers would poison any module
  // graph that a client component happens to touch.
  const { cookies } = await import("next/headers");
  return cookies().get(ACCESS_TOKEN_COOKIE)?.value;
}

/**
 * Tell the API who the visitor is. The browser reaches the API through this
 * server, so without this every visitor shares the server's address and the
 * API's per-IP rate limits would throttle everyone together. The secret proves
 * the header comes from us (see app/core/rate_limit.py). Only attached to
 * calls that are rate limited - reading headers() opts a page out of static
 * rendering, which ordinary GETs must keep.
 */
async function forwardClientIp(headers: Headers, method: string, path: string): Promise<void> {
  const secret = process.env.INTERNAL_PROXY_SECRET;
  if (!secret) return;
  if (method === "GET" && !path.startsWith("/search/understand")) return;
  try {
    const { headers: requestHeaders } = await import("next/headers");
    const h = requestHeaders();
    const ip = h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim();
    if (ip) {
      headers.set("X-Client-IP", ip);
      headers.set("X-Proxy-Secret", secret);
    }
  } catch {
    // Outside a request scope (build, scripts): no visitor to forward.
  }
}

/**
 * Fetch `path` (e.g. "/login") against the API base URL.
 *
 * Resolves with the parsed JSON body on 2xx; throws {@link ApiError} on
 * anything else, including transport failures.
 */
export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { body, rawBody, auth = true, token, headers, ...rest } = options;

  const finalHeaders = new Headers(headers);
  if (body !== undefined && !finalHeaders.has("Content-Type")) {
    finalHeaders.set("Content-Type", "application/json");
  }
  if (!finalHeaders.has("Accept")) finalHeaders.set("Accept", "application/json");

  if (auth) {
    const bearer = token ?? (await tokenFromCookie());
    if (bearer) finalHeaders.set("Authorization", `Bearer ${bearer}`);
  }

  await forwardClientIp(finalHeaders, (rest.method ?? "GET").toUpperCase(), path);

  const url = `${API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: finalHeaders,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
      // Auth responses must never be served from a cache.
      cache: rest.cache ?? "no-store",
    });
  } catch (cause) {
    throw new ApiError(
      0,
      "Could not reach the server. Is the backend running?",
      null,
      cause instanceof Error ? cause.message : String(cause),
    );
  }

  // 204 and friends carry no body.
  if (res.status === 204 || res.headers.get("content-length") === "0") {
    if (res.ok) return undefined as T;
    throw new ApiError(res.status, messageFromPayload(res.status, null));
  }

  const text = await res.text();
  let payload: ApiErrorPayload | null = null;
  let parsed = false;
  try {
    payload = text === "" ? null : (JSON.parse(text) as ApiErrorPayload);
    parsed = true;
  } catch {
    parsed = false;
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      parsed
        ? messageFromPayload(res.status, payload)
        : messageFromPayload(res.status, null),
      parsed ? payload : null,
      parsed ? null : text.slice(0, 500),
    );
  }

  if (!parsed) {
    throw new ApiError(
      res.status,
      "The server returned a malformed response.",
      null,
      text.slice(0, 500),
    );
  }

  return payload as T;
}

/* ------------------------------------------------------------- auth calls */

/**
 * POST /api/v1/login - exchange email + password for a JWT.
 *
 * Auth is email + bcrypt password (app/api/v1/auth.py). There is no phone
 * sign-in: an account is created and entered with an email and a password.
 *
 * @throws {ApiError} 401 when the credentials are wrong.
 */
export function login(payload: LoginRequest): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/login", {
    method: "POST",
    body: payload,
    auth: false,
  });
}

/**
 * POST /api/v1/signup - create an account and get a JWT back (201).
 *
 * @throws {ApiError} 409 when the email is already registered.
 */
export function signup(payload: SignupRequest): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/signup", {
    method: "POST",
    body: payload,
    auth: false,
  });
}

/**
 * GET /api/v1/me - the signed-in user, including the `is_admin` flag that
 * stands in for a role (the JWT itself carries no role claim).
 *
 * Doubles as token validation: a bad or expired JWT yields a 401.
 */
export function getMe(token?: string): Promise<UserResponse> {
  return apiFetch<UserResponse>("/me", { method: "GET", token });
}

/* -------------------------------------------------------- directory calls */

/**
 * GET /api/v1/categories - the category taxonomy.
 *
 * Omit `parentId` for the root level; pass one to get that category's
 * children. Public, so no token is attached.
 */
export function getCategories(parentId?: number): Promise<Category[]> {
  const qs = parentId === undefined ? "" : `?parent_id=${encodeURIComponent(parentId)}`;
  return apiFetch<Category[]>(`/categories${qs}`, { method: "GET", auth: false });
}

/**
 * GET /api/v1/businesses/search - the directory search.
 *
 * Undefined and empty values are dropped rather than sent as blanks, so a
 * cleared filter does not become `city=`. Public, so no token is attached.
 *
 * @throws {ApiError} 422 when lat/lng are not supplied together, when
 * `radius_km` or `sort=distance` are used without a point, or when a value is
 * out of range.
 */
export function searchBusinesses(
  params: BusinessSearchParams = {},
): Promise<SearchResponse> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    // Multi-select filters repeat the parameter: ?city=Burnaby&city=Richmond.
    for (const one of Array.isArray(value) ? value : [value]) {
      if (typeof one === "string" && one.trim() === "") continue;
      qs.append(key, String(one));
    }
  }
  const suffix = qs.toString();
  // Signed-in searches are attributed in search analytics; the token is sent
  // when there is one, and search stays public when there is not.
  return apiFetch<SearchResponse>(
    `/businesses/search${suffix ? `?${suffix}` : ""}`,
    { method: "GET" },
  );
}

/**
 * GET /businesses/by-slug/{slug} - public listing detail.
 *
 * Approved and active only; anything else 404s, which is what the public
 * detail page turns into notFound(). Returns null instead of throwing on 404
 * so callers do not have to catch to handle "no such listing".
 *
 * (This replaced a stopgap that paged through /businesses/search looking for
 * a slug match, because no detail endpoint existed.)
 */
export async function getBusinessBySlug(
  slug: string,
): Promise<BusinessDetail | null> {
  try {
    return await apiFetch<BusinessDetail>(
      `/businesses/by-slug/${encodeURIComponent(slug)}`,
      { method: "GET", auth: false },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * GET /search/understand - free search text read as filters. Public. The
 * backend answers `source: "keywords"` itself when its model fails; transport
 * failures and timeouts still throw, and the caller falls back.
 */
export function understandSearch(
  q: string,
  lang: "en" | "fr",
  signal?: AbortSignal,
): Promise<SearchUnderstanding> {
  const qs = new URLSearchParams({ q, lang });
  return apiFetch<SearchUnderstanding>(`/search/understand?${qs.toString()}`, {
    method: "GET",
    auth: false,
    signal,
  });
}

/** GET /businesses/cities - cities with public listings, busiest first. */
export function getCities(): Promise<CityCount[]> {
  return apiFetch<CityCount[]>("/businesses/cities", { method: "GET", auth: false });
}

/* ------------------------------------------------------- saved listings */

/** GET /favorites - the caller's saved listings, newest first. */
export function getFavorites(): Promise<Favorite[]> {
  return apiFetch<Favorite[]>("/favorites", { method: "GET" });
}

/** PUT /favorites/{id} - save a listing. Idempotent. */
export function saveFavorite(businessId: number): Promise<void> {
  return apiFetch<void>(`/favorites/${businessId}`, { method: "PUT" });
}

/** DELETE /favorites/{id} - unsave a listing. Idempotent. */
export function removeFavorite(businessId: number): Promise<void> {
  return apiFetch<void>(`/favorites/${businessId}`, { method: "DELETE" });
}

/* ---------------------------------------------------------- owner calls */

/** GET /businesses/owner/mine - the caller's listings, any status. */
export function getMyBusinesses(): Promise<BusinessOwnerItem[]> {
  return apiFetch<BusinessOwnerItem[]>("/businesses/owner/mine", {
    method: "GET",
  });
}

/**
 * GET /businesses/{id} - a listing the caller owns, for the edit form.
 *
 * Throws ApiError 403 when the listing belongs to somebody else and 404 when
 * it does not exist; callers should distinguish the two.
 */
export function getMyBusiness(businessId: number): Promise<BusinessDetail> {
  return apiFetch<BusinessDetail>(`/businesses/${businessId}`, { method: "GET" });
}

/** POST /businesses - create a listing, owned by the caller and pending. */
export function createBusiness(payload: BusinessCreate): Promise<BusinessDetail> {
  return apiFetch<BusinessDetail>("/businesses", { method: "POST", body: payload });
}

/**
 * PATCH /businesses/{id} - partial update.
 *
 * Note the server sends an approved listing back to `pending` when its content
 * changes, so the caller should expect the status to move.
 */
export function updateBusiness(
  businessId: number,
  payload: BusinessUpdate,
): Promise<BusinessDetail> {
  return apiFetch<BusinessDetail>(`/businesses/${businessId}`, {
    method: "PATCH",
    body: payload,
  });
}

/* -------------------------------------------------------- enquiry calls */

/**
 * POST /businesses/{id}/enquiries - record a lead.
 *
 * `auth: false` because this is open to anonymous visitors. When a token is
 * present the backend attributes the lead, but it is never required; the
 * caller passes one explicitly if it has one.
 */
export function createEnquiry(
  businessId: number,
  payload: EnquiryCreate,
  token?: string,
): Promise<EnquiryAck> {
  return apiFetch<EnquiryAck>(`/businesses/${businessId}/enquiries`, {
    method: "POST",
    body: payload,
    auth: token !== undefined,
    token,
  });
}

/**
 * GET /businesses/{id}/enquiries - the owner's leads inbox, newest first.
 *
 * @throws {ApiError} 403 when the listing belongs to someone else.
 */
export function getEnquiries(
  businessId: number,
  options: { enquiry_type?: EnquiryType; limit?: number; offset?: number } = {},
): Promise<EnquiryOut[]> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) qs.set(key, String(value));
  }
  const suffix = qs.toString();
  return apiFetch<EnquiryOut[]>(
    `/businesses/${businessId}/enquiries${suffix ? `?${suffix}` : ""}`,
    { method: "GET" },
  );
}

/* --------------------------------------------------------- review calls */

/** GET /businesses/{id}/reviews - public, newest first. */
export function getReviews(
  businessId: number,
  options: { limit?: number; offset?: number } = {},
): Promise<BusinessReview[]> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) qs.set(key, String(value));
  }
  const suffix = qs.toString();
  return apiFetch<BusinessReview[]>(
    `/businesses/${businessId}/reviews${suffix ? `?${suffix}` : ""}`,
    { method: "GET", auth: false },
  );
}

/** GET /businesses/{id}/reviews/summary - average, count and histogram. */
export function getReviewSummary(
  businessId: number,
): Promise<BusinessReviewSummary> {
  return apiFetch<BusinessReviewSummary>(
    `/businesses/${businessId}/reviews/summary`,
    { method: "GET", auth: false },
  );
}

/**
 * POST /businesses/{id}/reviews - leave a review. Requires an account.
 *
 * @throws {ApiError} 409 when this user has already reviewed the listing,
 * 403 when they own it.
 */
export function createReview(
  businessId: number,
  payload: BusinessReviewCreate,
): Promise<BusinessReview> {
  return apiFetch<BusinessReview>(`/businesses/${businessId}/reviews`, {
    method: "POST",
    body: payload,
  });
}

/**
 * POST /businesses/{id}/reviews/{reviewId}/reply - the owner's reply.
 *
 * One reply per review: calling this again overwrites the previous text.
 *
 * @throws {ApiError} 403 when the listing belongs to someone else, 404 when
 * the review is not on this listing.
 */
export function replyToReview(
  businessId: number,
  reviewId: number,
  reply: string,
): Promise<BusinessReview> {
  return apiFetch<BusinessReview>(
    `/businesses/${businessId}/reviews/${reviewId}/reply`,
    { method: "POST", body: { reply } },
  );
}

/* ------------------------------------------------------ moderation calls */

/**
 * GET /api/v1/admin/businesses - the moderation queue. Admin only.
 *
 * Defaults to pending, oldest first, so the longest-waiting owner surfaces
 * first - the opposite of every other list in this API.
 */
export function getModerationQueue(
  status?: BusinessStatus,
  options: { limit?: number; offset?: number } = {},
): Promise<ModerationQueueItem[]> {
  const qs = new URLSearchParams();
  if (status !== undefined) qs.set("status", status);
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) qs.set(key, String(value));
  }
  const suffix = qs.toString();
  return apiFetch<ModerationQueueItem[]>(
    `/admin/businesses${suffix ? `?${suffix}` : ""}`,
    { method: "GET" },
  );
}

/** GET /api/v1/admin/businesses/stats - counts per status. Admin only. */
export function getModerationStats(): Promise<ModerationStats> {
  return apiFetch<ModerationStats>("/admin/businesses/stats", { method: "GET" });
}

/**
 * Apply a moderation decision. Admin only.
 *
 * `reason` is required by the API for reject and suspend - the owner reads it -
 * and optional for approve.
 */
export function moderateBusiness(
  businessId: number,
  action: ModerationAction,
  reason?: string,
): Promise<BusinessDetail> {
  return apiFetch<BusinessDetail>(`/admin/businesses/${businessId}/${action}`, {
    method: "POST",
    body: reason !== undefined ? { reason } : undefined,
  });
}

/* ------------------------------------------------------------ chat calls */

/**
 * POST /chat/conversations - get-or-create the caller's thread with a listing.
 *
 * Idempotent: pressing "Start chat" again reopens the existing thread rather
 * than forking the history.
 *
 * @throws {ApiError} 400 when the caller owns the listing, 404 when it is not
 * publicly visible.
 */
export function startConversation(businessId: number): Promise<Conversation> {
  return apiFetch<Conversation>("/chat/conversations", {
    method: "POST",
    body: { business_id: businessId },
  });
}

/** GET /chat/conversations - every thread the caller is in, either side. */
export function getConversations(): Promise<Conversation[]> {
  return apiFetch<Conversation[]>("/chat/conversations", { method: "GET" });
}

/**
 * GET /chat/conversations/{id} - a thread with its history.
 *
 * @throws {ApiError} 404 for a thread the caller is not part of - the
 * existence of other people's conversations is itself private.
 */
export function getConversation(
  conversationId: number,
): Promise<ConversationDetail> {
  return apiFetch<ConversationDetail>(`/chat/conversations/${conversationId}`, {
    method: "GET",
  });
}

/**
 * GET /chat/conversations/{id}/messages?after_id= - what the caller has not
 * seen. Ids are monotonic within a thread, so polling needs no clock
 * agreement between client and server.
 */
export function getNewMessages(
  conversationId: number,
  afterId: number,
): Promise<ChatMessage[]> {
  return apiFetch<ChatMessage[]>(
    `/chat/conversations/${conversationId}/messages?after_id=${afterId}`,
    { method: "GET" },
  );
}

/** POST /chat/conversations/{id}/messages */
export function sendMessage(
  conversationId: number,
  body: string,
): Promise<ChatMessage> {
  return apiFetch<ChatMessage>(`/chat/conversations/${conversationId}/messages`, {
    method: "POST",
    body: { body },
  });
}

/** POST /chat/conversations/{id}/read */
export function markConversationRead(
  conversationId: number,
): Promise<Conversation> {
  return apiFetch<Conversation>(`/chat/conversations/${conversationId}/read`, {
    method: "POST",
  });
}

/* -------------------------------------------------------- profile calls */

/** GET /profile - the signed-in user's own record. */
export function getProfile(): Promise<UserResponse> {
  return apiFetch<UserResponse>("/profile", { method: "GET" });
}

/**
 * PATCH /profile - update the caller's own details.
 *
 * Only name, phone and preferred_contact_method are accepted: email is the
 * login identity and role is not self-assignable.
 */
export function updateProfile(payload: ProfileUpdate): Promise<UserResponse> {
  return apiFetch<UserResponse>("/profile", { method: "PATCH", body: payload });
}

/**
 * GET /admin/enquiries - every lead in the directory. Admin only.
 *
 * The CSV export is not here: it returns a file, not JSON, so the browser is
 * pointed at our own route handler and streams it rather than round-tripping
 * the bytes through this client.
 */
export function getAdminEnquiries(options: {
  enquiry_type?: EnquiryType;
  business_id?: number;
  page?: number;
  page_size?: number;
} = {}): Promise<AdminEnquiryPage> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) qs.set(key, String(value));
  }
  const suffix = qs.toString();
  return apiFetch<AdminEnquiryPage>(
    `/admin/enquiries${suffix ? `?${suffix}` : ""}`,
    { method: "GET" },
  );
}

/* ------------------------------------------------------------- support */

/**
 * POST /support - a question, feedback, or a bug report.
 *
 * `token` is optional: an anonymous sender is accepted and simply not
 * attributed. The backend stores the message before it tries to email it, so
 * a 201 means it is recorded whether or not the notification went out.
 */
export function createSupportMessage(
  payload: SupportMessageCreate,
  token?: string,
): Promise<SupportMessageAccepted> {
  return apiFetch<SupportMessageAccepted>("/support", {
    method: "POST",
    body: payload,
    auth: false,
    token,
  });
}

/* -------------------------------------------------------- chat realtime */

/** Spec-named alias for getConversations(). */
export const listConversations = getConversations;

/** Full history for a thread, oldest first. */
export function getMessages(conversationId: number): Promise<ChatMessage[]> {
  return getNewMessages(conversationId, 0);
}

/**
 * POST /chat/ws-ticket - a 60-second, single-conversation credential for the
 * WebSocket.
 *
 * The access token is deliberately NOT used for the socket: it lives in an
 * httpOnly cookie so XSS cannot lift it, and a URL query string leaks into
 * logs, proxies and referrers. A stolen ticket buys a minute of one
 * conversation instead of the account.
 */
export function getWsTicket(
  conversationId: number,
): Promise<{ ticket: string; expires_in: number }> {
  return apiFetch<{ ticket: string; expires_in: number }>(
    `/chat/ws-ticket?conversation_id=${conversationId}`,
    { method: "POST" },
  );
}

/* ------------------------------------------------------- admin overview */

/** GET /admin/stats - counts across the directory. Admin only. */
export function getAdminStats(): Promise<AdminStats> {
  return apiFetch<AdminStats>("/admin/stats", { method: "GET" });
}

/** GET /admin/reviews - every review, newest first, optionally filtered. */
export function getAllReviews(
  options: { q?: string; limit?: number; offset?: number } = {},
): Promise<AdminReviewItem[]> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined && String(value) !== "") qs.set(key, String(value));
  }
  const suffix = qs.toString();
  return apiFetch<AdminReviewItem[]>(`/admin/reviews${suffix ? `?${suffix}` : ""}`, {
    method: "GET",
  });
}

/**
 * DELETE /admin/reviews/{id} - remove a review and refresh the listing's
 * rating. Admin only: a business deleting its own bad reviews would make
 * every rating on the site meaningless.
 */
export function deleteReview(reviewId: number): Promise<void> {
  return apiFetch<void>(`/admin/reviews/${reviewId}`, { method: "DELETE" });
}

/** Spec-named aliases over the listing moderation endpoints. */
export const getPendingListings = () => getModerationQueue("pending", { limit: 100 });
export const approveListing = (id: number) => moderateBusiness(id, "approve");
export const rejectListing = (id: number, reason: string) =>
  moderateBusiness(id, "reject", reason);
export const suspendListing = (id: number, reason: string) =>
  moderateBusiness(id, "suspend", reason);

/* -------------------------------------------------- verification (KYC) */

/**
 * GET /businesses/{id}/verification - where this listing's KYC stands.
 *
 * Returns null on 404 rather than throwing, because "never submitted" is a
 * normal state the dashboard renders differently from "pending", not an error.
 */
export async function getVerification(
  businessId: number,
): Promise<BusinessVerification | null> {
  try {
    return await apiFetch<BusinessVerification>(
      `/businesses/${businessId}/verification`,
      { method: "GET" },
    );
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) return null;
    throw error;
  }
}

/**
 * POST /businesses/{id}/verification - submit, or resubmit after a rejection.
 *
 * An upsert server-side: one listing has one KYC record, and resubmitting
 * sends it back to `pending` and clears the previous rejection. Note that
 * resubmitting a *verified* listing also sends it back for review, which
 * takes it out of public search until someone re-checks it.
 */
export function submitVerification(
  businessId: number,
  payload: VerificationSubmit,
): Promise<BusinessVerification> {
  return apiFetch<BusinessVerification>(
    `/businesses/${businessId}/verification`,
    { method: "POST", body: payload },
  );
}

/**
 * GET /uploads/presign - a short-lived URL to PUT one KYC document to.
 *
 * Owner-scoped: the backend derives the object key from a listing the caller
 * owns, so a crafted filename cannot write outside that listing's prefix.
 */
export function presignDocument(params: {
  business_id: number;
  filename: string;
  content_type: string;
  purpose: string;
}): Promise<PresignResponse> {
  const qs = new URLSearchParams(
    Object.entries(params).map(([key, value]) => [key, String(value)]),
  );
  return apiFetch<PresignResponse>(`/uploads/presign?${qs.toString()}`, {
    method: "GET",
  });
}

/* ---------------------------------------------- verification moderation */

/**
 * GET /admin/verifications/pending - the KYC queue, oldest first.
 *
 * Oldest first like the listing queue: the person who has been waiting
 * longest should be seen first.
 */
export function getPendingVerifications(
  options: { limit?: number; offset?: number } = {},
): Promise<PendingVerificationItem[]> {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(options)) {
    if (value !== undefined) qs.set(key, String(value));
  }
  const suffix = qs.toString();
  return apiFetch<PendingVerificationItem[]>(
    `/admin/verifications/pending${suffix ? `?${suffix}` : ""}`,
    { method: "GET" },
  );
}

/**
 * GET /admin/verifications/{id} - one submission, whatever its status.
 *
 * Not restricted to pending on purpose: a reviewer who has just approved
 * something is still on its page, and a detail view that 404s the moment you
 * act on it is one you cannot trust.
 */
export function getVerificationForReview(
  verificationId: number,
): Promise<PendingVerificationItem> {
  return apiFetch<PendingVerificationItem>(
    `/admin/verifications/${verificationId}`,
    { method: "GET" },
  );
}

/** POST /admin/verifications/{id}/approve - mark a business verified. */
export function approveVerification(
  verificationId: number,
  note?: string,
): Promise<BusinessVerification> {
  return apiFetch<BusinessVerification>(
    `/admin/verifications/${verificationId}/approve`,
    { method: "POST", body: note !== undefined ? { note } : {} },
  );
}

/**
 * POST /admin/verifications/{id}/reject - refuse it, with a reason.
 *
 * The reason is required by the API and shown to the owner: a rejection they
 * cannot act on just produces the same submission again.
 */
export function rejectVerification(
  verificationId: number,
  reason: string,
): Promise<BusinessVerification> {
  return apiFetch<BusinessVerification>(
    `/admin/verifications/${verificationId}/reject`,
    { method: "POST", body: { reason } },
  );
}

/**
 * GET /admin/verifications/{id}/documents/{kind} - follow the API's redirect
 * to a signed URL for one submitted document.
 *
 * The stored value is an s3:// address a browser cannot open, and a signature
 * minted at upload time would have expired long before a reviewer got here, so
 * the API signs on demand and 307s. This reads that Location without following
 * it, because the caller - our own route handler - has to hand the signed URL
 * to the browser rather than fetch the bytes itself.
 *
 * Returns null when there is nothing to serve: no document of that kind, or a
 * placeholder written while storage was unconfigured.
 */
export async function getVerificationDocumentLink(
  verificationId: number,
  kind: "license" | "gst",
): Promise<string | null> {
  const { cookies } = await import("next/headers");
  const token = cookies().get(ACCESS_TOKEN_COOKIE)?.value;

  const res = await fetch(
    `${API_BASE_URL}/admin/verifications/${verificationId}/documents/${kind}`,
    {
      method: "GET",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      redirect: "manual",
      cache: "no-store",
    },
  );

  if (res.status === 307 || res.status === 302) {
    return res.headers.get("location");
  }
  return null;
}

/* --------------------------------------------- plans and registration */

/** GET /plans - the plans on offer, in display order. Public. */
export function getPlans(): Promise<Plan[]> {
  return apiFetch<Plan[]>("/plans", { method: "GET", auth: false });
}

/**
 * POST /registration/start - step 1 for a new business account.
 *
 * Returns a token for the new (inactive) account; the caller sets the session
 * cookie from it.
 *
 * @throws {ApiError} 409 when the email already has an account.
 */
export function startRegistration(
  payload: RegistrationStartRequest,
): Promise<RegistrationStarted> {
  return apiFetch<RegistrationStarted>("/registration/start", {
    method: "POST",
    body: payload,
    auth: false,
  });
}

/**
 * POST /registration/convert - step 1 for a signed-in customer: their account
 * becomes a business account (inactive until registration completes).
 */
export function convertToBusinessAccount(
  payload: RegistrationDetailsUpdate,
): Promise<RegistrationState> {
  return apiFetch<RegistrationState>("/registration/convert", {
    method: "POST",
    body: payload,
  });
}

/** GET /registration - where the signed-in owner has got to. */
export function getRegistration(): Promise<RegistrationState> {
  return apiFetch<RegistrationState>("/registration", { method: "GET" });
}

/** PUT /registration/details - edit step 1 after going back. */
export function updateRegistrationDetails(
  payload: RegistrationDetailsUpdate,
): Promise<RegistrationState> {
  return apiFetch<RegistrationState>("/registration/details", {
    method: "PUT",
    body: payload,
  });
}

/** PUT /registration/plan - save the chosen plan (replacing any earlier one). */
export function chooseRegistrationPlan(planId: number): Promise<RegistrationState> {
  return apiFetch<RegistrationState>("/registration/plan", {
    method: "PUT",
    body: { plan_id: planId },
  });
}

/**
 * POST /registration/payment - pay for the chosen plan and complete.
 *
 * @throws {ApiError} 402 with a customer-facing message when declined.
 */
export function payForRegistration(
  payment: RegistrationPaymentRequest,
): Promise<RegistrationState> {
  return apiFetch<RegistrationState>("/registration/payment", {
    method: "POST",
    body: payment,
  });
}

/** POST /registration/complete - complete on a free plan (terms still apply). */
export function completeFreeRegistration(acceptTerms: boolean): Promise<RegistrationState> {
  return apiFetch<RegistrationState>("/registration/complete", {
    method: "POST",
    body: { accept_terms: acceptTerms },
  });
}

/* ------------------------------------------------------ search analytics */

/** POST /search/clicks - a search result was opened, called or enquired. */
export function recordSearchClick(payload: {
  search_id: string;
  business_id: number;
  action: ClickAction;
}): Promise<{ recorded: boolean }> {
  return apiFetch<{ recorded: boolean }>("/search/clicks", {
    method: "POST",
    body: payload,
    auth: false,
  });
}

/** POST /businesses/{id}/booking-clicks - the "Book online" button was pressed. */
export function recordBookingClick(businessId: number): Promise<void> {
  return apiFetch<void>(`/businesses/${businessId}/booking-clicks`, {
    method: "POST",
    auth: false,
  });
}

/** GET /admin/search-analytics - CTR per tier, rotation fairness, top performers. */
export function getSearchAnalytics(days = 30): Promise<SearchAnalytics> {
  return apiFetch<SearchAnalytics>(`/admin/search-analytics?days=${days}`, { method: "GET" });
}

/** GET /businesses/{id}/search-performance - one listing, for its owner. */
export function getBusinessSearchPerformance(
  businessId: number,
  days = 30,
): Promise<BusinessSearchPerformance> {
  return apiFetch<BusinessSearchPerformance>(
    `/businesses/${businessId}/search-performance?days=${days}`,
    { method: "GET" },
  );
}

/* ---------------------------------------------------------------- booking */

/** GET /businesses/{id}/booking-info - public; 404 when the business takes no requests. */
export function getBookingInfo(businessId: number): Promise<BookingInfo> {
  return apiFetch<BookingInfo>(`/businesses/${businessId}/booking-info`, {
    method: "GET",
    auth: false,
  });
}

/** POST /bookings - a signed-in customer asks for a service. */
export function createBooking(body: BookingCreate, idempotencyKey?: string): Promise<Booking> {
  return apiFetch<Booking>("/bookings", {
    method: "POST",
    body,
    // A retry with the same key returns the first booking instead of a second.
    headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
  });
}

/** GET /bookings/mine */
export function getMyBookings(): Promise<Booking[]> {
  return apiFetch<Booking[]>("/bookings/mine", { method: "GET" });
}

/** POST /bookings/{id}/cancel - withdraw a request or cancel a confirmed booking. */
export function cancelMyBooking(bookingId: number, reason: string | null): Promise<Booking> {
  return apiFetch<Booking>(`/bookings/${bookingId}/cancel`, { method: "POST", body: { reason } });
}

/** GET /businesses/{id}/bookings - owner, pending first. */
export function getOwnerBookings(businessId: number): Promise<Booking[]> {
  return apiFetch<Booking[]>(`/businesses/${businessId}/bookings`, { method: "GET" });
}

/** POST /businesses/{id}/bookings/{bid}/{action} - accept, decline, cancel, complete, no-show. */
export function actOnBooking(
  businessId: number,
  bookingId: number,
  action: BookingAction,
  body: unknown,
): Promise<Booking> {
  return apiFetch<Booking>(`/businesses/${businessId}/bookings/${bookingId}/${action}`, {
    method: "POST",
    body: body ?? {},
  });
}

/** GET /businesses/{id}/services - owner, including ones no longer offered. */
export function getServices(businessId: number): Promise<BookableService[]> {
  return apiFetch<BookableService[]>(`/businesses/${businessId}/services`, { method: "GET" });
}

export function createService(businessId: number, body: ServiceInput): Promise<BookableService> {
  return apiFetch<BookableService>(`/businesses/${businessId}/services`, { method: "POST", body });
}

export function updateService(
  businessId: number,
  serviceId: number,
  body: Partial<ServiceInput> & { is_active?: boolean },
): Promise<BookableService> {
  return apiFetch<BookableService>(`/businesses/${businessId}/services/${serviceId}`, {
    method: "PATCH",
    body,
  });
}

export function deleteService(businessId: number, serviceId: number): Promise<void> {
  return apiFetch<void>(`/businesses/${businessId}/services/${serviceId}`, { method: "DELETE" });
}
