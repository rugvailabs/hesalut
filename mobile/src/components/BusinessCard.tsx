/**
 * One listing in a list - the mobile counterpart of web/components/BusinessCard.
 *
 * Distance is only rendered when the search actually supplied a point;
 * `distance_km` is null otherwise, and inventing "0 km" would be a lie about
 * where the user is.
 */

import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { Badge } from "./Badge";
import Card from "./Card";
import RatingStars from "./RatingStars";
import { color, space, type } from "../theme";
import type { BusinessListItem } from "../lib/types";

/** "1.4 km away", or "800 m away" once kilometres stop being useful. */
export function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)} m away` : `${km.toFixed(1)} km away`;
}

export default function BusinessCard({
  business,
  onPress,
}: {
  business: BusinessListItem;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <Card
      onPress={onPress}
      accessibilityLabel={`${business.name}, ${business.category_name} in ${business.city}${
        business.bookable === true ? ", bookable" : ""
      }`}
      style={styles.card}
    >
      <View style={styles.headline}>
        <Text style={styles.name} numberOfLines={2}>
          {business.name}
        </Text>
        {business.verified ? <Text style={styles.verified}>Verified</Text> : null}
      </View>

      <Text style={styles.meta} numberOfLines={1}>
        {business.category_name} · {business.city}, {business.province}
      </Text>

      {business.bookable === true ? (
        <View style={styles.badges}>
          <Badge tone="good">Bookable</Badge>
        </View>
      ) : null}

      <RatingStars
        rating={business.rating}
        reviewCount={business.review_count}
        size="sm"
      />

      {business.description !== null ? (
        <Text style={styles.body} numberOfLines={2}>
          {business.description}
        </Text>
      ) : null}

      {business.distance_km !== null ? (
        <Text style={styles.distance}>{formatDistance(business.distance_km)}</Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: space.xs },
  badges: { flexDirection: "row", gap: space.xs },
  headline: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.sm,
  },
  name: {
    flex: 1,
    fontSize: type.heading.fontSize,
    fontWeight: "600",
    color: color.ink,
  },
  verified: { fontSize: type.micro.fontSize, fontWeight: "600", color: color.goodText },
  meta: { fontSize: type.small.fontSize, color: color.subtle },
  body: {
    fontSize: type.small.fontSize,
    lineHeight: type.small.lineHeight,
    color: color.muted,
  },
  distance: { fontSize: type.small.fontSize, fontWeight: "600", color: color.body },
});
