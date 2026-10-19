/**
 * Where the backend lives, from the app's point of view.
 *
 * On a simulator "localhost" is the simulator itself, and on a physical phone
 * it is the phone - so a hardcoded localhost works in exactly one of the three
 * places this app runs. Expo already knows the developer machine's LAN address
 * (it is how the bundle reached the device), so we borrow that host and swap
 * the port.
 *
 * Set EXPO_PUBLIC_API_URL to override - a staging server, or a tunnel.
 */

import Constants from "expo-constants";

/** "192.168.1.24:8081" -> "192.168.1.24". Undefined in a production build. */
function packagerHost(): string | undefined {
  const hostUri =
    Constants.expoConfig?.hostUri ??
    // Older Expo Go clients report it here instead.
    (Constants.expoGoConfig as { debuggerHost?: string } | undefined)?.debuggerHost;
  const host = hostUri?.split(":")[0]?.trim();
  return host && host !== "" ? host : undefined;
}

/** Trailing slash trimmed so `${API_BASE_URL}${path}` never doubles up. */
export const API_BASE_URL = (
  process.env.EXPO_PUBLIC_API_URL ??
  `http://${packagerHost() ?? "localhost"}:8000/api/v1`
).replace(/\/+$/, "");

/**
 * The website, for the few things the app hands over to it - a booking request
 * is made there, where the sign-in and the form already are. Same borrowed host
 * as the API, on the web app's port; set EXPO_PUBLIC_WEB_URL for a deployed
 * site.
 */
export const WEB_BASE_URL = (
  process.env.EXPO_PUBLIC_WEB_URL ?? `http://${packagerHost() ?? "localhost"}:3001`
).replace(/\/+$/, "");

/**
 * The chat socket is mounted at the server root, not under /api/v1, so this
 * strips the version prefix rather than appending to it.
 */
export const WS_BASE_URL = API_BASE_URL.replace(/^http/, "ws").replace(
  /\/api\/v1$/,
  "",
);
