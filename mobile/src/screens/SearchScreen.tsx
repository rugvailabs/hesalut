/**
 * Search: query, filters, results, and a real "near me".
 *
 * The web version keeps its state in the URL, which is what makes a result set
 * shareable. There is no URL here, so the state lives in the screen and the
 * route params are only the starting point - what Home handed over.
 *
 * "Near me" is the one genuinely different piece. The browser asks for a
 * position and gets one or an error; expo-location has a permission that can be
 * denied once, denied forever, or granted while location services are switched
 * off at the OS level, and each of those needs different words. Falling back
 * silently to an unlocated search would be worse than saying what happened.
 *
 * Submitted text goes through /search/understand first, which turns "plumber
 * in burnaby open now" into filters. The screen says what it understood and
 * offers the exact words instead, because a guess the person cannot see or
 * undo is worse than no guess. When the model is unavailable the endpoint
 * answers `source: "keywords"` and the search runs exactly as typed.
 */

import React, { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, StyleSheet, Text, View } from "react-native";
import * as Location from "expo-location";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";

import Alert from "../components/Alert";
import BusinessCard from "../components/BusinessCard";
import Button from "../components/Button";
import Field from "../components/Field";
import VoiceSearchButton from "../components/VoiceSearchButton";
import { Badge } from "../components/Badge";
import { EmptyState, ErrorState, Loading } from "../components/States";
import { searchBusinesses, understandSearch } from "../lib/api";
import { deviceLanguage, speechLocale } from "../lib/locale";
import { useAsync } from "../lib/useAsync";
import { color, radius, space, type } from "../theme";
import type { SearchStackParamList } from "../navigation/types";
import type {
  BusinessSearchParams,
  BusinessSort,
  SearchResponse,
  SearchUnderstanding,
} from "../lib/types";

type Props = NativeStackScreenProps<SearchStackParamList, "Search">;

/** Read once: the device language does not change under a running screen. */
const LANGUAGE = deviceLanguage();

/** Same radius the web app's Near me uses, so both apps mean the same thing. */
const NEAR_ME_RADIUS_KM = 25;

const SORTS: { value: BusinessSort; label: string }[] = [
  { value: "relevance", label: "Relevant" },
  { value: "rating", label: "Top rated" },
  { value: "reviews", label: "Most reviewed" },
  { value: "name", label: "A–Z" },
  { value: "newest", label: "Newest" },
];

const MIN_RATINGS = [
  { value: undefined, label: "Any rating" },
  { value: 3, label: "3★ and up" },
  { value: 4, label: "4★ and up" },
  { value: 4.5, label: "4.5★ and up" },
];

interface Point {
  lat: number;
  lng: number;
}

export default function SearchScreen({
  route,
  navigation,
}: Props): React.JSX.Element {
  const initial = route.params ?? {};

  const [query, setQuery] = useState(initial.q ?? "");
  // Committed separately from `query`: searching on every keystroke would fire
  // a request per letter over a mobile connection.
  const [submitted, setSubmitted] = useState(initial.q ?? "");
  const [categorySlug, setCategorySlug] = useState(initial.category_slug);
  const [minRating, setMinRating] = useState<number | undefined>(undefined);
  // The "Bookable" chip. null means "follow what the words said" (a search like
  // "dentist I can book online" arrives bookable); true or false is the
  // person's own choice, which a new search starts over from.
  const [bookable, setBookable] = useState<boolean | null>(null);
  const [sort, setSort] = useState<BusinessSort>("relevance");
  const [point, setPoint] = useState<Point | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  // What /search/understand made of `submitted`; null means search it as typed.
  const [understood, setUnderstood] = useState<SearchUnderstanding | null>(null);
  // Starts true when Home handed over text, so the first search waits for it.
  const [understanding, setUnderstanding] = useState(
    (initial.q ?? "").trim() !== "",
  );
  const [listening, setListening] = useState(false);
  const [voiceMessage, setVoiceMessage] = useState<string | null>(null);
  // Only the newest submission may apply its filters.
  const understandRun = useRef(0);
  // Set when "near me" came from the words rather than the button, so taking
  // the exact words instead also takes the location back off.
  const locatedFromText = useRef(false);

  const load = useCallback(async (): Promise<SearchResponse> => {
    // Filters are not known yet. Park this run: the one that starts when they
    // arrive supersedes it, and `loading` stays true in the meantime instead
    // of flashing the previous results.
    if (understanding) return new Promise<SearchResponse>(() => {});
    const smart = understood;
    const params: BusinessSearchParams = {
      q: smart !== null ? (smart.keywords ?? undefined) : submitted || undefined,
      category_slug:
        smart !== null && smart.category_slugs.length > 0
          ? smart.category_slugs
          : categorySlug,
      city: smart?.cities,
      postal_code: smart?.postal_code ?? undefined,
      hours: smart?.hours,
      rating_band: smart?.rating_bands,
      price: smart?.price_levels,
      bookable: (bookable ?? smart?.bookable === true) ? true : undefined,
      min_rating: minRating,
      // The API 422s on sort=distance without a point, so the two move together.
      sort: point !== null ? "distance" : sort,
      lat: point?.lat,
      lng: point?.lng,
      radius_km: point !== null ? NEAR_ME_RADIUS_KM : undefined,
      page,
      page_size: 20,
    };
    return searchBusinesses(params);
  }, [understanding, understood, submitted, categorySlug, minRating, bookable, sort, point, page]);

  const { data, error, loading, refreshing, reload } = useAsync<SearchResponse>(
    load,
    [understanding, understood, submitted, categorySlug, minRating, bookable, sort, point, page],
  );
  const bookableOn = bookable ?? understood?.bookable === true;

  /** Any change to the filters starts again at page 1. */
  const resetTo = useCallback((apply: () => void) => {
    setPage(1);
    apply();
  }, []);

  const useMyLocation = useCallback(async (): Promise<void> => {
    setLocating(true);
    setLocationError(null);
    try {
      const { status, canAskAgain } =
        await Location.requestForegroundPermissionsAsync();

      if (status !== Location.PermissionStatus.GRANTED) {
        setLocationError(
          canAskAgain
            ? "Location permission was declined. Search by city instead, or allow location and try again."
            : "Location is blocked for this app. Turn it on in Settings, or search by city instead.",
        );
        return;
      }

      // Balanced, not Highest: a directory needs the right neighbourhood, not
      // the right doorstep, and the cheaper fix returns much faster indoors.
      const position = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      resetTo(() =>
        setPoint({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      );
    } catch {
      // Thrown when location services are off device-wide, which permission
      // status does not tell us.
      setLocationError(
        "Could not get a location fix. Check that location services are on.",
      );
    } finally {
      setLocating(false);
    }
  }, [resetTo]);

  const clearLocation = useCallback(() => {
    setLocationError(null);
    locatedFromText.current = false;
    resetTo(() => setPoint(null));
  }, [resetTo]);

  /**
   * Typed or spoken text: understand it, then search with what came back.
   *
   * Any failure of the understand call - network, a 5xx, a backend without the
   * endpoint yet - lands in the same place as `source: "keywords"`: the words
   * are searched as typed, which is what this screen always did.
   */
  const submitText = useCallback(
    async (raw: string): Promise<void> => {
      const text = raw.trim();
      const run = ++understandRun.current;
      setQuery(text);
      setPage(1);
      setBookable(null);
      setSubmitted(text);
      setUnderstood(null);
      if (text === "") {
        setUnderstanding(false);
        return;
      }
      setUnderstanding(true);

      let result: SearchUnderstanding | null = null;
      try {
        result = await understandSearch(text, LANGUAGE);
      } catch {
        result = null;
      }
      if (run !== understandRun.current) return;

      const smart = result?.source === "ai" ? result : null;
      // Get the fix before releasing the search, so "near me" runs once,
      // located. A declined permission shows its own warning and the search
      // goes ahead without a point.
      if (smart?.near_me === true && point === null) {
        await useMyLocation();
        if (run !== understandRun.current) return;
        locatedFromText.current = true;
      }
      // The words named a category, so one carried over from Home would only
      // narrow the result to nothing.
      if (smart !== null && smart.category_slugs.length > 0) {
        setCategorySlug(undefined);
      }
      setUnderstood(smart);
      setUnderstanding(false);
    },
    [point, useMyLocation],
  );

  /** Drop what was understood and search the words exactly as entered. */
  const searchExactly = useCallback(() => {
    ++understandRun.current;
    setPage(1);
    setBookable(null);
    setUnderstood(null);
    setUnderstanding(false);
    if (locatedFromText.current) {
      locatedFromText.current = false;
      setPoint(null);
    }
  }, []);

  // Home's "Near me" button opens this screen already asking for a fix, and
  // text from Home's search box gets the same understanding as text typed here.
  useEffect(() => {
    if (initial.nearMe === true) void useMyLocation();
    if ((initial.q ?? "").trim() !== "") void submitText(initial.q ?? "");
    // Only on the params that arrived with the navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial.nearMe, initial.q]);

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  return (
    <View style={styles.screen}>
      <View style={styles.controls}>
        <View style={styles.row}>
          <Field
            value={query}
            onChangeText={setQuery}
            placeholder={
              listening ? "Listening… say what you need" : "Plumbers open now in Burnaby…"
            }
            returnKeyType="search"
            autoCorrect={false}
            // The recogniser writes here while listening; typing over it
            // would be lost when the final transcript lands.
            editable={!listening}
            onSubmitEditing={() => void submitText(query)}
            accessibilityLabel="Search listings"
            containerStyle={styles.grow}
          />
          <VoiceSearchButton
            lang={speechLocale(LANGUAGE)}
            onPartial={setQuery}
            onFinal={(text) => void submitText(text)}
            onListeningChange={setListening}
            onMessage={setVoiceMessage}
          />
        </View>

        {voiceMessage !== null ? (
          <Alert tone="warning">{voiceMessage}</Alert>
        ) : null}

        <View style={styles.row}>
          <Button
            busy={understanding}
            onPress={() => void submitText(query)}
            style={styles.grow}
          >
            Search
          </Button>
          {point === null ? (
            <Button
              variant="secondary"
              busy={locating}
              onPress={() => void useMyLocation()}
              style={styles.grow}
            >
              {locating ? "Locating…" : "📍 Near me"}
            </Button>
          ) : (
            <Button variant="secondary" onPress={clearLocation} style={styles.grow}>
              Clear location
            </Button>
          )}
        </View>

        {locationError !== null ? (
          <Alert tone="warning">{locationError}</Alert>
        ) : null}

        {understood !== null ? (
          <View style={styles.understood} accessibilityLiveRegion="polite">
            <Text style={styles.summary}>
              Showing:{" "}
              <Text style={styles.summaryStrong}>{understood.summary}</Text>
            </Text>
            {understood.unsupported.length > 0 ? (
              <Text style={styles.unsupported}>
                {`Can't filter by ${understood.unsupported.join(", ")} yet, so results may not match that part.`}
              </Text>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              onPress={searchExactly}
              style={styles.exact}
              accessibilityLabel={`Clear this and search for ${submitted} exactly`}
            >
              {`✕ Search "${submitted}" exactly`}
            </Button>
          </View>
        ) : null}

        {/* Chips rather than the web's selects: a native picker for five
            options costs two taps and a modal. */}
        <FlatList
          horizontal
          data={MIN_RATINGS}
          keyExtractor={(item) => String(item.value ?? "any")}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
          renderItem={({ item }) => (
            <Chip
              label={item.label}
              selected={minRating === item.value}
              onPress={() => resetTo(() => setMinRating(item.value))}
            />
          )}
        />

        <View style={styles.chipRow}>
          <Chip
            label={bookableOn ? "📅 Bookable ✕" : "📅 Bookable"}
            selected={bookableOn}
            onPress={() => resetTo(() => setBookable(!bookableOn))}
          />
        </View>

        {point === null ? (
          <FlatList
            horizontal
            data={SORTS}
            keyExtractor={(item) => item.value}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
            renderItem={({ item }) => (
              <Chip
                label={item.label}
                selected={sort === item.value}
                onPress={() => resetTo(() => setSort(item.value))}
              />
            )}
          />
        ) : (
          <View style={styles.chipRow}>
            <Badge tone="info">{`Nearest first, within ${NEAR_ME_RADIUS_KM} km`}</Badge>
          </View>
        )}

        {categorySlug !== undefined ? (
          <View style={styles.chipRow}>
            <Chip
              label={`Category: ${categorySlug} ✕`}
              selected
              onPress={() => resetTo(() => setCategorySlug(undefined))}
            />
          </View>
        ) : null}
      </View>

      {understanding ? (
        <Loading label="Understanding your search…" />
      ) : loading ? (
        <Loading label="Searching…" />
      ) : error !== null ? (
        <ErrorState
          error={error}
          fallback="Could not run that search."
          onRetry={() => void reload()}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={styles.results}
          refreshing={refreshing}
          onRefresh={() => void reload(true)}
          ListHeaderComponent={
            <Text style={styles.count}>
              {total.toLocaleString("en-CA")}{" "}
              {total === 1 ? "listing" : "listings"}
              {point !== null ? " near you" : ""}
            </Text>
          }
          renderItem={({ item }) => (
            <BusinessCard
              business={item}
              onPress={() =>
                navigation.navigate("Business", {
                  slug: item.slug,
                  name: item.name,
                })
              }
            />
          )}
          ListEmptyComponent={
            <EmptyState
              title="No listings match that"
              body={
                point !== null
                  ? `Nothing within ${NEAR_ME_RADIUS_KM} km. Try clearing the location, or a broader search.`
                  : understood !== null
                    ? "Try searching the exact words instead, or a broader search."
                    : "Try a different term, or clear the filters."
              }
            />
          }
          ListFooterComponent={
            data !== null && data.total_pages > 1 ? (
              <View style={styles.pager}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!data.has_prev}
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </Button>
                <Text style={styles.pageLabel}>
                  Page {data.page} of {data.total_pages}
                </Text>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!data.has_next}
                  onPress={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </View>
            ) : null
          }
        />
      )}
    </View>
  );
}

function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Button
      size="sm"
      variant={selected ? "primary" : "secondary"}
      onPress={onPress}
      style={styles.chip}
    >
      {label}
    </Button>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: color.canvas },
  controls: {
    gap: space.sm,
    padding: space.lg,
    paddingBottom: space.sm,
    backgroundColor: color.surface,
    borderBottomWidth: 1,
    borderBottomColor: color.hairline,
  },
  row: { flexDirection: "row", gap: space.sm },
  understood: {
    gap: space.xs,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: color.wash,
  },
  summary: { fontSize: type.small.fontSize, color: color.muted },
  summaryStrong: { color: color.ink, fontWeight: "600" },
  unsupported: { fontSize: type.small.fontSize, color: color.subtle },
  exact: { alignSelf: "flex-start", paddingHorizontal: 0 },
  grow: { flex: 1 },
  chipRow: { gap: space.sm, paddingVertical: 2 },
  chip: { borderRadius: radius.pill },
  results: { padding: space.lg, gap: space.sm, paddingBottom: space.xxl },
  count: {
    fontSize: type.small.fontSize,
    color: color.subtle,
    marginBottom: space.xs,
  },
  pager: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: space.lg,
  },
  pageLabel: { fontSize: type.small.fontSize, color: color.muted },
});
