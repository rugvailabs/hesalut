/**
 * A listing: details, reviews, and the two things a directory exists for -
 * calling the business and messaging it.
 *
 * The web version reveals a hidden phone number, because that click is the
 * closest a browser gets to observing intent. A phone can do better: the
 * button opens the dialer with the number in it, so the tracked lead and the
 * actual call are the same gesture rather than two hopeful steps.
 */

import React, { useCallback, useState } from "react";
import {
  Alert as NativeAlert,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";

import Alert from "../components/Alert";
import Button from "../components/Button";
import Card from "../components/Card";
import Field from "../components/Field";
import RatingStars from "../components/RatingStars";
import { ErrorState, Loading, errorMessage } from "../components/States";
import {
  ApiError,
  createEnquiry,
  getBusinessBySlug,
  getReviews,
  recordBookingClick,
  startConversation,
} from "../lib/api";
import { WEB_BASE_URL } from "../lib/config";
import { getToken } from "../lib/tokenStore";
import { useSession } from "../lib/session";
import { useAsync } from "../lib/useAsync";
import { color, space, type } from "../theme";
import type { RootTabParamList, SearchStackParamList } from "../navigation/types";
import type { BusinessDetail, BusinessReview } from "../lib/types";

// Registered in both the Home and Search stacks; the params are identical, so
// one of the two is enough to type the props.
type Props = NativeStackScreenProps<SearchStackParamList, "Business">;

interface Profile {
  business: BusinessDetail | null;
  reviews: BusinessReview[];
}

/** Digits and a leading + only - what a dialer will accept. */
function toTelUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

function formatDay(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-CA", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
}

export default function BusinessScreen({
  route,
}: Props): React.JSX.Element {
  const { slug } = route.params;
  const { status } = useSession();
  // The chat thread lives in another tab, so this needs the tab navigator
  // rather than the stack one the props carry.
  const navigation = useNavigation<BottomTabNavigationProp<RootTabParamList>>();

  const [enquiryMessage, setEnquiryMessage] = useState("");
  const [enquiryName, setEnquiryName] = useState("");
  const [enquiryPhone, setEnquiryPhone] = useState("");
  const [enquiryState, setEnquiryState] = useState<
    { kind: "idle" } | { kind: "sending" } | { kind: "sent" } | { kind: "error"; message: string }
  >({ kind: "idle" });
  const [chatBusy, setChatBusy] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);

  const load = useCallback(async (): Promise<Profile> => {
    const business = await getBusinessBySlug(slug);
    if (business === null) return { business: null, reviews: [] };
    // A failing reviews call must not take the profile down with it.
    const reviews = await getReviews(business.id, { limit: 20 }).catch(() => []);
    return { business, reviews };
  }, [slug]);

  const { data, error, loading, refreshing, reload } = useAsync<Profile>(load, [slug]);
  const business = data?.business ?? null;

  const call = useCallback(async (): Promise<void> => {
    if (business === null || business.phone === null) return;

    // Fire-and-forget, exactly as on the web: the dialer must never wait on
    // lead tracking, and a failed analytics write must never block a call.
    const token = await getToken();
    void createEnquiry(
      business.id,
      { enquiry_type: "call_click" },
      token ?? undefined,
    ).catch(() => undefined);

    const url = toTelUrl(business.phone);
    try {
      await Linking.openURL(url);
    } catch {
      // A tablet or simulator with no dialer: show the number so the person
      // can still use it rather than leaving them with a dead button.
      NativeAlert.alert("No dialer on this device", business.phone);
    }
  }, [business]);

  /**
   * Booking, by what the owner set up. Their own booking page opens as is - and
   * only if it really is https, whatever the server sent - with the press
   * counted on the side. A booking request is made on the website, where the
   * sign-in and the form are, so the app hands the person over to that page.
   */
  const book = useCallback(async (): Promise<void> => {
    if (business === null) return;
    let url: string | null = null;
    if (business.booking_mode === "external" && business.booking_url) {
      if (!business.booking_url.startsWith("https://")) return;
      url = business.booking_url;
      void recordBookingClick(business.id).catch(() => undefined);
    } else if (business.booking_mode === "request") {
      url = `${WEB_BASE_URL}/business/${encodeURIComponent(business.slug)}/book`;
    }
    if (url === null) return;
    try {
      await Linking.openURL(url);
    } catch {
      NativeAlert.alert("Could not open the booking page", url);
    }
  }, [business]);

  const sendEnquiry = useCallback(async (): Promise<void> => {
    if (business === null) return;
    const message = enquiryMessage.trim();
    if (message === "") {
      setEnquiryState({ kind: "error", message: "Tell them what you need." });
      return;
    }

    setEnquiryState({ kind: "sending" });
    try {
      const token = await getToken();
      await createEnquiry(
        business.id,
        {
          enquiry_type: "quote",
          message,
          contact_name: enquiryName.trim() || null,
          contact_phone: enquiryPhone.trim() || null,
        },
        token ?? undefined,
      );
      setEnquiryState({ kind: "sent" });
      setEnquiryMessage("");
    } catch (cause) {
      setEnquiryState({
        kind: "error",
        message: errorMessage(cause, "Could not send that enquiry."),
      });
    }
  }, [business, enquiryMessage, enquiryName, enquiryPhone]);

  const openChat = useCallback(async (): Promise<void> => {
    if (business === null) return;
    if (status !== "signedIn") {
      navigation.navigate("AccountTab", {
        screen: "Login",
        params: { reason: "Sign in to message this business." },
      });
      return;
    }

    setChatBusy(true);
    setChatError(null);
    try {
      const conversation = await startConversation(business.id);
      navigation.navigate("ChatTab", {
        screen: "Thread",
        params: {
          conversationId: conversation.id,
          title: conversation.business_name,
        },
      });
    } catch (cause) {
      // 400 is the backend refusing to let an owner chat with themselves.
      setChatError(
        cause instanceof ApiError && cause.status === 400
          ? "This is your own listing."
          : errorMessage(cause, "Could not open a conversation."),
      );
    } finally {
      setChatBusy(false);
    }
  }, [business, status, navigation]);

  if (loading) return <Loading label="Loading listing…" />;
  if (error !== null) {
    return (
      <ErrorState
        error={error}
        fallback="Could not load that listing."
        onRetry={() => void reload()}
      />
    );
  }
  if (business === null) {
    return (
      <ErrorState
        error={new Error("not found")}
        fallback="That listing is not available. It may have been removed or is awaiting review."
      />
    );
  }

  const reviews = data?.reviews ?? [];

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={() => void reload(true)} />
      }
    >
      <View style={styles.header}>
        <Text style={styles.name}>{business.name}</Text>
        <Text style={styles.meta}>
          {business.category_name ?? "Uncategorised"} · {business.city},{" "}
          {business.province}
        </Text>
        <RatingStars
          rating={business.rating}
          reviewCount={business.review_count}
        />
      </View>

      {business.booking_mode === "external" && business.booking_url ? (
        <Button onPress={() => void book()}>📅 Book online</Button>
      ) : null}
      {business.booking_mode === "request" ? (
        <View style={styles.bookRequest}>
          <Button onPress={() => void book()}>📅 Request a booking</Button>
          <Text style={styles.muted}>
            Opens the website, where you sign in and choose the times that suit you.
          </Text>
        </View>
      ) : null}

      {/* The web app has a sticky action bar; the phone equivalent is putting
          the two actions above the fold, where a thumb already is. */}
      <View style={styles.actions}>
        {business.phone !== null ? (
          <Button onPress={() => void call()} style={styles.grow}>
            📞 Call
          </Button>
        ) : null}
        <Button
          variant="secondary"
          busy={chatBusy}
          onPress={() => void openChat()}
          style={styles.grow}
        >
          💬 Message
        </Button>
      </View>
      {chatError !== null ? <Alert tone="error">{chatError}</Alert> : null}

      {business.description !== null ? (
        <Card>
          <Text style={styles.sectionTitle}>About</Text>
          <Text style={styles.body}>{business.description}</Text>
          {business.tags !== null && business.tags.length > 0 ? (
            <View style={styles.tags}>
              {business.tags.map((tag) => (
                <Text key={tag} style={styles.tag}>
                  {tag}
                </Text>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <Text style={styles.sectionTitle}>Contact</Text>
        <Row label="Address">
          {[business.address, `${business.city}, ${business.province}`, business.postal_code]
            .filter(Boolean)
            .join("\n")}
        </Row>
        <Row label="Phone">{business.phone ?? "Not listed"}</Row>
        <Row label="Website">{business.website ?? "Not listed"}</Row>
        <Row label="Price range">{business.price_range ?? "—"}</Row>
      </Card>

      {business.opening_hours !== null &&
      Object.keys(business.opening_hours).length > 0 ? (
        <Card>
          <Text style={styles.sectionTitle}>Opening hours</Text>
          {Object.entries(business.opening_hours).map(([day, ranges]) => (
            <View key={day} style={styles.hoursRow}>
              <Text style={styles.hoursDay}>{day}</Text>
              <Text style={styles.hoursValue}>
                {ranges.map((range) => `${range[0]}–${range[1]}`).join(", ")}
              </Text>
            </View>
          ))}
        </Card>
      ) : null}

      {/* Photos need a business_photos table the backend does not have. Saying
          so beats an empty carousel that looks like a failed image load. */}
      <Card>
        <Text style={styles.sectionTitle}>Photos</Text>
        <Text style={styles.muted}>
          No photos yet. Listing photos need a backend table that does not exist
          yet, so this space stays honest rather than showing placeholders.
        </Text>
      </Card>

      <Card>
        <Text style={styles.sectionTitle}>Request a quote</Text>
        {enquiryState.kind === "sent" ? (
          <Alert tone="success" title="Sent">
            {business.name} has your enquiry and will be in touch.
          </Alert>
        ) : (
          <View style={styles.form}>
            <Field
              label="What do you need?"
              value={enquiryMessage}
              onChangeText={setEnquiryMessage}
              placeholder="Describe the job, and when you need it"
              multiline
              numberOfLines={3}
              style={styles.textarea}
            />
            <Field
              label="Your name"
              value={enquiryName}
              onChangeText={setEnquiryName}
              placeholder="Optional"
              autoComplete="name"
            />
            <Field
              label="Your phone"
              value={enquiryPhone}
              onChangeText={setEnquiryPhone}
              placeholder="Optional"
              keyboardType="phone-pad"
              autoComplete="tel"
            />
            {enquiryState.kind === "error" ? (
              <Alert tone="error">{enquiryState.message}</Alert>
            ) : null}
            <Button
              block
              busy={enquiryState.kind === "sending"}
              onPress={() => void sendEnquiry()}
            >
              Send enquiry
            </Button>
          </View>
        )}
      </Card>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>
          Reviews {reviews.length > 0 ? `(${business.review_count})` : ""}
        </Text>
        {reviews.length === 0 ? (
          <Card>
            <Text style={styles.muted}>
              No reviews yet. Be the first to review {business.name}.
            </Text>
          </Card>
        ) : (
          reviews.map((review) => (
            <Card key={review.id} style={styles.review}>
              <RatingStars rating={review.rating} showCount={false} size="sm" />
              {review.title !== null ? (
                <Text style={styles.reviewTitle}>{review.title}</Text>
              ) : null}
              <Text style={styles.reviewMeta}>
                {review.author_name} · {formatDay(review.created_at)}
              </Text>
              {review.body !== null ? (
                <Text style={styles.body}>{review.body}</Text>
              ) : null}
              {review.owner_reply !== null ? (
                <View style={styles.reply}>
                  <Text style={styles.replyLabel}>Reply from the owner</Text>
                  <Text style={styles.body}>{review.owner_reply}</Text>
                </View>
              ) : null}
            </Card>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: string;
}): React.JSX.Element {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  header: { gap: space.xs },
  name: {
    fontSize: type.title.fontSize,
    lineHeight: type.title.lineHeight,
    fontWeight: "700",
    color: color.ink,
  },
  meta: { fontSize: type.small.fontSize, color: color.subtle },
  actions: { flexDirection: "row", gap: space.sm },
  bookRequest: { gap: space.xs },
  grow: { flex: 1 },
  section: { gap: space.sm },
  sectionTitle: {
    fontSize: type.heading.fontSize,
    fontWeight: "600",
    color: color.ink,
    marginBottom: space.xs,
  },
  body: {
    fontSize: type.body.fontSize,
    lineHeight: type.body.lineHeight,
    color: color.body,
  },
  muted: {
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    color: color.subtle,
  },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: space.xs, marginTop: space.sm },
  tag: {
    fontSize: type.micro.fontSize,
    color: color.muted,
    backgroundColor: color.wash,
    paddingHorizontal: space.sm,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: "hidden",
  },
  row: { flexDirection: "row", gap: space.sm, paddingVertical: space.xs },
  rowLabel: { width: 96, fontSize: type.small.fontSize, color: color.subtle },
  rowValue: { flex: 1, fontSize: type.small.fontSize, color: color.body },
  hoursRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  hoursDay: { fontSize: type.small.fontSize, color: color.body, textTransform: "capitalize" },
  hoursValue: { fontSize: type.small.fontSize, color: color.muted },
  form: { gap: space.md },
  textarea: { minHeight: 88, textAlignVertical: "top" },
  review: { gap: space.xs },
  reviewTitle: { fontSize: type.body.fontSize, fontWeight: "600", color: color.ink },
  reviewMeta: { fontSize: type.small.fontSize, color: color.subtle },
  reply: {
    marginTop: space.xs,
    paddingLeft: space.md,
    borderLeftWidth: 2,
    borderLeftColor: color.line,
    gap: 2,
  },
  replyLabel: { fontSize: type.micro.fontSize, fontWeight: "600", color: color.subtle },
});
