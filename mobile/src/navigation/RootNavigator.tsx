/**
 * Three tabs, four for an owner, each with its own stack.
 *
 * The Business tab is mounted only when /me says role is business_owner. Two
 * reasons it is conditional rather than always-there-and-empty: a tab that
 * exists but explains it is not for you is noise on a 375pt bar, and the
 * session already knows the answer before the first render, so nothing has to
 * appear late.
 */

import React from "react";
import { StyleSheet, Text } from "react-native";
import { NavigationContainer, type Theme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";

import AccountScreen from "../screens/AccountScreen";
import BusinessScreen from "../screens/BusinessScreen";
import HomeScreen from "../screens/HomeScreen";
import LeadsScreen from "../screens/LeadsScreen";
import ListingsScreen from "../screens/ListingsScreen";
import LoginScreen from "../screens/LoginScreen";
import SearchScreen from "../screens/SearchScreen";
import { useSession } from "../lib/session";
import { color, type } from "../theme";
import type {
  AccountStackParamList,
  HomeStackParamList,
  OwnerStackParamList,
  RootTabParamList,
  SearchStackParamList,
} from "./types";

/** The web app's palette, applied to the bits React Navigation paints itself. */
const navigationTheme: Theme = {
  dark: false,
  colors: {
    primary: color.ink,
    background: color.canvas,
    card: color.surface,
    text: color.ink,
    border: color.hairline,
    notification: color.star,
  },
  fonts: {
    regular: { fontFamily: "System", fontWeight: "400" },
    medium: { fontFamily: "System", fontWeight: "500" },
    bold: { fontFamily: "System", fontWeight: "600" },
    heavy: { fontFamily: "System", fontWeight: "700" },
  },
};

const screenOptions = {
  headerStyle: { backgroundColor: color.surface },
  headerTitleStyle: { color: color.ink, fontWeight: "600" as const },
  headerTintColor: color.ink,
  contentStyle: { backgroundColor: color.canvas },
};

const HomeStack = createNativeStackNavigator<HomeStackParamList>();

function HomeNavigator(): React.JSX.Element {
  return (
    <HomeStack.Navigator screenOptions={screenOptions}>
      <HomeStack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: "hesalut" }}
      />
      <HomeStack.Screen
        name="Business"
        component={BusinessScreen}
        options={({ route }) => ({ title: route.params.name ?? "Listing" })}
      />
    </HomeStack.Navigator>
  );
}

const SearchStack = createNativeStackNavigator<SearchStackParamList>();

function SearchNavigator(): React.JSX.Element {
  return (
    <SearchStack.Navigator screenOptions={screenOptions}>
      <SearchStack.Screen
        name="Search"
        component={SearchScreen}
        options={{ title: "Search" }}
      />
      <SearchStack.Screen
        name="Business"
        component={BusinessScreen}
        options={({ route }) => ({ title: route.params.name ?? "Listing" })}
      />
    </SearchStack.Navigator>
  );
}

const OwnerStack = createNativeStackNavigator<OwnerStackParamList>();

function OwnerNavigator(): React.JSX.Element {
  return (
    <OwnerStack.Navigator screenOptions={screenOptions}>
      <OwnerStack.Screen
        name="Listings"
        component={ListingsScreen}
        options={{ title: "My listings" }}
      />
      <OwnerStack.Screen
        name="Leads"
        component={LeadsScreen}
        options={({ route }) => ({ title: route.params.name })}
      />
    </OwnerStack.Navigator>
  );
}

const AccountStack = createNativeStackNavigator<AccountStackParamList>();

function AccountNavigator(): React.JSX.Element {
  return (
    <AccountStack.Navigator screenOptions={screenOptions}>
      <AccountStack.Screen
        name="Account"
        component={AccountScreen}
        options={{ title: "Account" }}
      />
      <AccountStack.Screen
        name="Login"
        component={LoginScreen}
        options={{ title: "Sign in" }}
      />
    </AccountStack.Navigator>
  );
}

const Tabs = createBottomTabNavigator<RootTabParamList>();

/** Emoji rather than an icon font: the same glyphs the web app uses. */
function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <Text style={[styles.tabIcon, focused && styles.tabIconOn]}>{glyph}</Text>
  );
}

export default function RootNavigator(): React.JSX.Element {
  const { isOwner } = useSession();

  return (
    <NavigationContainer theme={navigationTheme}>
      <Tabs.Navigator
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: color.ink,
          tabBarInactiveTintColor: color.subtle,
          tabBarStyle: {
            backgroundColor: color.surface,
            borderTopColor: color.hairline,
          },
          tabBarLabelStyle: { fontSize: type.micro.fontSize, fontWeight: "600" },
        }}
      >
        <Tabs.Screen
          name="HomeTab"
          component={HomeNavigator}
          options={{
            title: "Home",
            tabBarIcon: ({ focused }) => <TabIcon glyph="🏠" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="SearchTab"
          component={SearchNavigator}
          options={{
            title: "Search",
            tabBarIcon: ({ focused }) => <TabIcon glyph="🔍" focused={focused} />,
          }}
        />
        {isOwner ? (
          <Tabs.Screen
            name="BusinessTab"
            component={OwnerNavigator}
            options={{
              title: "Business",
              tabBarIcon: ({ focused }) => <TabIcon glyph="📋" focused={focused} />,
            }}
          />
        ) : null}
        <Tabs.Screen
          name="AccountTab"
          component={AccountNavigator}
          options={{
            title: "Account",
            tabBarIcon: ({ focused }) => <TabIcon glyph="👤" focused={focused} />,
          }}
        />
      </Tabs.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabIcon: { fontSize: 18, opacity: 0.55 },
  tabIconOn: { opacity: 1 },
});
