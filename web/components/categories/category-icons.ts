/**
 * Category glyphs, ported from the reference block's ICONS map.
 *
 * Inline stroke paths rather than images: fifty-six categories would otherwise be
 * fifty-six image requests for artwork that is 200 bytes of path data. Only the
 * glyphs our real taxonomy uses are kept - the source shipped 33 for a sample
 * catalogue we do not have.
 *
 * Each glyph is ONE path `d` (CategoryIcon renders a single <path>): icons
 * built from several elements have their circles, rects and lines folded into
 * path commands.
 */

export type IconKey =
  | "auto"
  | "beauty"
  | "build"
  | "food"
  | "health"
  | "home"
  | "gear"
  | "server"
  | "bulb"
  | "box"
  | "shield"
  | "trophy"
  | "roof"
  | "floor"
  | "fan"
  | "spray"
  | "bug"
  | "roller"
  | "trees"
  | "lock"
  | "hammer"
  | "washer"
  | "hardhat"
  | "door"
  | "stethoscope"
  | "pill"
  | "person"
  | "bone"
  | "glasses"
  | "hand"
  | "brain"
  | "paw"
  | "coffee"
  | "basket"
  | "chef"
  | "droplets"
  | "truck"
  | "cone"
  | "cap"
  | "baby"
  | "music"
  | "calculator"
  | "key"
  | "umbrella"
  | "globe"
  | "stamp"
  | "languages"
  | "camera"
  | "party"
  | "printer"
  | "scissors"
  | "spool"
  | "shirt"
  | "dog"
  | "phone"
  | "bike";

export const CATEGORY_ICONS: Record<IconKey, string> = {
  auto: "M4 16v-3l2-5h12l2 5v3M4 16h16M7 16v2M17 16v2M7 12h10",
  beauty: "M12 3c3 4 5 6 5 9a5 5 0 0 1-10 0c0-3 2-5 5-9Z",
  build: "M4 21V7l8-4v18M12 21h8V11h-8M7 10h2M7 14h2M15 15h2",
  food: "M7 3v7a2 2 0 0 0 4 0V3M9 10v11M15 21V3c2 1 3 3 3 6s-1 4-3 4",
  health: "M10 3h4v7h7v4h-7v7h-4v-7H3v-4h7z",
  home: "M3 11 12 4l9 7M5 10v10h14V10M10 20v-5h4v5",
  gear: "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2",
  server: "M3 4h18v6H3zM3 14h18v6H3zM7 7h.01M7 17h.01",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10c1 1 1 2 1 3h6c0-1 0-2 1-3a6 6 0 0 0-4-10Z",
  box: "m12 3 9 5v8l-9 5-9-5V8l9-5ZM3 8l9 5 9-5M12 13v10",
  shield: "M12 3 4 6v6c0 5 4 8 8 9 4-1 8-4 8-9V6l-8-3ZM9 12l2 2 4-4",
  trophy: "M7 4h10v5a5 5 0 0 1-10 0V4ZM7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3M10 14v3h4v-3M8 21h8",
  // Drawn for this set: a roof with its chimney, and floorboards.
  roof: "M2 12 12 4l10 8M16 7.2V4h3v5.6M5 9.6V20h14V9.6",
  floor: "M3 5h18v14H3ZM3 9.7h18M3 14.3h18M10 5v4.7M15 9.7v4.6M8 14.3V19M17 5v4.7",
  // Below: path data from Lucide (lucide.dev, ISC licence), elements merged into one path.
  fan: "M10.827 16.379a6.082 6.082 0 0 1-8.618-7.002l5.412 1.45a6.082 6.082 0 0 1 7.002-8.618l-1.45 5.412a6.082 6.082 0 0 1 8.618 7.002l-5.412-1.45a6.082 6.082 0 0 1-7.002 8.618l1.45-5.412ZM12 12v.01",
  spray: "M3 3h.01M7 5h.01M11 7h.01M3 7h.01M7 9h.01M3 11h.01M15 5h4v4h-4ZM19 9l2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2M13 14l8-2M13 19l8-2",
  bug: "M12 20v-9M14 7a4 4 0 0 1 4 4v3a6 6 0 0 1-12 0v-3a4 4 0 0 1 4-4zM14.12 3.88 16 2M21 21a4 4 0 0 0-3.81-4M21 5a4 4 0 0 1-3.55 3.97M22 13h-4M3 21a4 4 0 0 1 3.81-4M3 5a4 4 0 0 0 3.55 3.97M6 13H2M8 2l1.88 1.88M9 7.13V6a3 3 0 1 1 6 0v1.13",
  roller: "M4 2h12a2 2 0 0 1 2 2v2a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-2a2 2 0 0 1 2 -2ZM10 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 16h2a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1Z",
  trees: "M10 10v.2A3 3 0 0 1 8.9 16H5a3 3 0 0 1-1-5.8V10a3 3 0 0 1 6 0ZM7 16v6M13 19v3M12 19h8.3a1 1 0 0 0 .7-1.7L18 14h.3a1 1 0 0 0 .7-1.7L16 9h.2a1 1 0 0 0 .8-1.7L13 3l-1.4 1.5",
  lock: "M11 16a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M5 10h14a2 2 0 0 1 2 2v8a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-8a2 2 0 0 1 2 -2ZM7 10V7a5 5 0 0 1 10 0v3",
  hammer: "M15 12l-9.373 9.373a1 1 0 0 1-3.001-3L12 9M18 15l4-4M21.5 11.5l-1.914-1.914A2 2 0 0 1 19 8.172v-.344a2 2 0 0 0-.586-1.414l-1.657-1.657A6 6 0 0 0 12.516 3H9l1.243 1.243A6 6 0 0 1 12 8.485V10l2 2h1.172a2 2 0 0 1 1.414.586L18.5 14.5",
  washer: "M3 6h3M17 6h.01M5 2h14a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2ZM7 13a5 5 0 1 0 10 0a5 5 0 1 0 -10 0M12 18a2.5 2.5 0 0 0 0-5 2.5 2.5 0 0 1 0-5",
  hardhat: "M10 10V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v5M14 6a6 6 0 0 1 6 6v3M4 15v-3a6 6 0 0 1 6-6M3 15h18a1 1 0 0 1 1 1v2a1 1 0 0 1 -1 1h-18a1 1 0 0 1 -1 -1v-2a1 1 0 0 1 1 -1Z",
  door: "M10 21H2M10 4a2 2 0 012.36-1.968l5.41.992A1.5 1.5 0 0119 4.5V21l-7.876.992A1 1 0 0110 21zM10.268 3H7a2 2 0 00-2 2v16M14 12h.01M22 21h-3",
  stethoscope: "M11 2v2M5 2v2M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1M8 15a6 6 0 0 0 12 0v-3M18 10a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  pill: "M10.5 20.5l10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7ZM8.5 8.5l7 7",
  person: "M11 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M9 20l3-6 3 6M6 8l6 2 6-2M12 10v4",
  bone: "M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z",
  glasses: "M2 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M14 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0M14 15a2 2 0 0 0-2-2 2 2 0 0 0-2 2M2.5 13 5 7c.7-1.3 1.4-2 3-2M21.5 13 19 7c-.7-1.3-1.5-2-3-2",
  hand: "M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v2M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15",
  brain: "M12 18V5M15 13a4.17 4.17 0 0 1-3-4 4.17 4.17 0 0 1-3 4M17.598 6.5A3 3 0 1 0 12 5a3 3 0 1 0-5.598 1.5M17.997 5.125a4 4 0 0 1 2.526 5.77M18 18a4 4 0 0 0 2-7.464M19.967 17.483A4 4 0 1 1 12 18a4 4 0 1 1-7.967-.517M6 18a4 4 0 0 1-2-7.464M6.003 5.125a4 4 0 0 0-2.526 5.77",
  paw: "M9 4a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M16 8a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M18 16a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z",
  coffee: "M10 2v2M14 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1M6 2v2",
  basket: "M15 11l-1 9M19 11l-4-7M2 11h20M3.5 11l1.6 7.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6l1.7-7.4M4.5 15.5h15M5 11l4-7M9 11l1 9",
  chef: "M17 21a1 1 0 0 0 1-1v-5.35c0-.457.316-.844.727-1.041a4 4 0 0 0-2.134-7.589 5 5 0 0 0-9.186 0 4 4 0 0 0-2.134 7.588c.411.198.727.585.727 1.041V20a1 1 0 0 0 1 1ZM6 17h12",
  droplets: "M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05zM12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97",
  truck: "M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2M15 18H9M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14M15 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0M5 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0",
  cone: "M16.05 10.966a5 2.5 0 0 1-8.1 0M16.923 14.049l4.48 2.04a1 1 0 0 1 .001 1.831l-8.574 3.9a2 2 0 0 1-1.66 0l-8.574-3.91a1 1 0 0 1 0-1.83l4.484-2.04M16.949 14.14a5 2.5 0 1 1-9.9 0L10.063 3.5a2 2 0 0 1 3.874 0zM9.194 6.57a5 2.5 0 0 0 5.61 0",
  cap: "M21.42 10.922a1 1 0 0 0-.019-1.838L12.83 5.18a2 2 0 0 0-1.66 0L2.6 9.08a1 1 0 0 0 0 1.832l8.57 3.908a2 2 0 0 0 1.66 0zM22 10v6M6 12.5V16a6 3 0 0 0 12 0v-3.5",
  baby: "M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5M15 12h.01M19.38 6.813A9 9 0 0 1 20.8 10.2a2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1M9 12h.01",
  music: "M9 18V5l12-2v13M3 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M15 16a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  calculator: "M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-12a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2ZM8 6L16 6M16 14L16 18M16 10h.01M12 10h.01M8 10h.01M12 14h.01M8 14h.01M12 18h.01M8 18h.01",
  key: "M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4zM16 7.5a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0",
  umbrella: "M12 13v7a2 2 0 0 0 4 0M12 2v2M20.992 13a1 1 0 0 0 .97-1.274 10.284 10.284 0 0 0-19.923 0A1 1 0 0 0 3 13z",
  globe: "M2 12a10 10 0 1 0 20 0a10 10 0 1 0 -20 0M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20",
  stamp: "M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-6 0c0 2 1 2 1 3.5V13M20 15.5a2.5 2.5 0 0 0-2.5-2.5h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1zM5 22h14",
  languages: "M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2h1M22 22l-5-10-5 10M14 18h6",
  camera: "M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4zM9 13a3 3 0 1 0 6 0a3 3 0 1 0 -6 0",
  party: "M5.8 11.3 2 22l10.7-3.79M4 3h.01M22 8h.01M15 2h.01M22 20h.01M22 2l-2.24.75a2.9 2.9 0 0 0-1.96 3.12c.1.86-.57 1.63-1.45 1.63h-.38c-.86 0-1.6.6-1.76 1.44L14 10M22 13l-.82-.33c-.86-.34-1.82.2-1.98 1.11c-.11.7-.72 1.22-1.43 1.22H17M11 2l.33.82c.34.86-.2 1.82-1.11 1.98C9.52 4.9 9 5.52 9 6.23V7M11 13c1.93 1.93 2.83 4.17 2 5-.83.83-3.07-.07-5-2-1.93-1.93-2.83-4.17-2-5 .83-.83 3.07.07 5 2Z",
  printer: "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6M7 14h10a1 1 0 0 1 1 1v6a1 1 0 0 1 -1 1h-10a1 1 0 0 1 -1 -1v-6a1 1 0 0 1 1 -1Z",
  scissors: "M3 6a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M8.12 8.12 12 12M20 4 8.12 15.88M3 18a3 3 0 1 0 6 0a3 3 0 1 0 -6 0M14.8 14.8 20 20",
  spool: "M17 13.44 4.442 17.082A2 2 0 0 0 4.982 21H19a2 2 0 0 0 .558-3.921l-1.115-.32A2 2 0 0 1 17 14.837V7.66M7 10.56l12.558-3.642A2 2 0 0 0 19.018 3H5a2 2 0 0 0-.558 3.921l1.115.32A2 2 0 0 1 7 9.163v7.178",
  shirt: "M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z",
  dog: "M11.25 16.25h1.5L12 17zM16 14v.5M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309M8 14v.5M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5",
  phone: "M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-16a2 2 0 0 1 2 -2ZM12 18h.01",
  bike: "M15 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M2 17.5a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0 -7 0M14 5a1 1 0 1 0 2 0a1 1 0 1 0 -2 0M12 17.5V14l-3-3 4-3 2 3h2",
};

/**
 * Which glyph each real category slug wears.
 *
 * Keyed by slug rather than display name: a name can be edited in the admin,
 * a slug is the identity the rest of the app routes on. An unmapped slug falls
 * back rather than crashing - see CategoryIcon.
 */
export const ICON_FOR_SLUG: Record<string, IconKey> = {
  plumbers: "build",
  electricians: "bulb",
  restaurants: "food",
  dentists: "health",
  "auto-repair": "gear",
  gyms: "trophy",
  salons: "beauty",
  movers: "box",
  "it-support": "server",
  legal: "shield",
  hotels: "home",
  "car-rentals": "auto",
  hvac: "fan",
  roofing: "roof",
  cleaning: "spray",
  "pest-control": "bug",
  painters: "roller",
  landscaping: "trees",
  locksmiths: "lock",
  handyman: "hammer",
  "appliance-repair": "washer",
  renovation: "hardhat",
  flooring: "floor",
  "windows-doors": "door",
  "walk-in-clinics": "stethoscope",
  pharmacies: "pill",
  physiotherapy: "person",
  chiropractors: "bone",
  optometrists: "glasses",
  "massage-therapy": "hand",
  counselling: "brain",
  veterinarians: "paw",
  "cafes-bakeries": "coffee",
  grocery: "basket",
  caterers: "chef",
  "car-wash": "droplets",
  towing: "truck",
  "driving-schools": "cone",
  tutoring: "cap",
  childcare: "baby",
  "music-lessons": "music",
  accountants: "calculator",
  "real-estate": "key",
  insurance: "umbrella",
  immigration: "globe",
  notaries: "stamp",
  translators: "languages",
  photographers: "camera",
  "event-planners": "party",
  "print-copy": "printer",
  barbers: "scissors",
  tailors: "spool",
  "dry-cleaners": "shirt",
  "pet-grooming": "dog",
  "device-repair": "phone",
  "bike-shops": "bike",
};
