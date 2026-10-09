# hesalut — mobile

Expo (SDK 57) + TypeScript app against the same FastAPI backend as `web/`.

## Running it

```bash
cd mobile
npm install
npm start            # then scan the QR with Expo Go, or press a for Android / i for iOS
```

The backend must be up (`docker compose up` in the repo root, API on `:8000`).

### How the app finds the backend

`localhost` means the phone itself, so a hardcoded `http://localhost:8000` works
on exactly none of the devices this runs on. `src/lib/config.ts` takes the LAN
address Expo already used to deliver the bundle and swaps the port:

```
http://<your machine's LAN IP>:8000/api/v1
```

Override it when that guess is wrong — a tunnel, a staging server, or a
simulator that wants `10.0.2.2`:

```bash
EXPO_PUBLIC_API_URL=http://192.168.1.24:8000/api/v1 npm start
```

The Account screen prints whichever base URL it ended up with, which is the
first thing to check when every screen says "could not reach the server".

The chat socket is derived from the same value: `ws://<host>:8000/ws/...`, since
the WebSocket is mounted at the server root rather than under `/api/v1`.

Two things about the dev backend being plain HTTP: iOS needs
`NSAllowsLocalNetworking` (already set in `app.json`) and Android needs cleartext
traffic, which Expo Go allows but a standalone release build does not. Both stop
mattering once the API is behind TLS.

### Voice search needs a development build

The microphone in the Search box uses `expo-speech-recognition`, a native
module that Expo Go does not include. In Expo Go the button is simply hidden
and typed search works as usual. To try voice search, build the app yourself:

```bash
npx expo run:android     # or: npx expo run:ios
# or a dev build from EAS: eas build --profile development
```

Recognition runs on the phone's own recogniser and asks for on-device
recognition wherever the OS supports it, in `fr-CA` or `en-CA` following the
device language. The transcript goes through the same smart search as typed
text (`GET /api/v1/search/understand`, then `/businesses/search`).

## What is shared with the web app

- `src/lib/types.ts` is a byte-identical copy of `web/lib/types.ts`.
  `diff web/lib/types.ts mobile/src/lib/types.ts` should print nothing.
- `src/lib/api.ts` is a port of `web/lib/api.ts`. `scripts/port_api.py`
  regenerates it from the web file and lists every deliberate difference; run it
  from `mobile/` after changing the web client, then read the diff.
- `src/theme.ts` carries the web app's Tailwind palette and type scale as
  literal values, so both apps look like one product.

The differences that are not cosmetic:

| | web | mobile |
|---|---|---|
| Token storage | httpOnly cookie | OS keystore, via `expo-secure-store` |
| Who calls the API | server components and route handlers (no CORS on the backend) | the device, directly — a native app is not a browser origin |
| Location | browser Geolocation | `expo-location`, with the permission states a phone actually has |
| Phone numbers | reveal a `tel:` link | `Linking.openURL` opens the real dialer |

## Scope

Phase one is deliberately read-mostly for owners: the Business tab lists their
listings and each listing's leads, and creating or editing a listing stays on
the web. Moderation is web-only too.
