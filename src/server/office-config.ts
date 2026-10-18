import "server-only";

/** Demo credentials require explicit operator opt-in for prototype review. */
export function officeConfig() {
  const env = process.env;
  const requestedDemo = env.GOOGLE_MAPS_DEMO_MODE === "true";
  const demoKey = requestedDemo
    ? env.REACT_APP_GOOGLE_MAPS_DEMO_KEY
    : undefined;
  const browserKey = env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY || demoKey;
  const placesKey =
    env.GOOGLE_PLACES_SERVER_KEY || (requestedDemo ? demoKey : undefined);
  const demo = requestedDemo;
  const enabled =
    env.GOOGLE_MAPS_ENABLED === "true" &&
    !!browserKey &&
    !!placesKey &&
    (env.OFFICE_PAGE_TOKEN_SECRET?.length ?? 0) >= 32 &&
    !!env.DATABASE_URL;
  return {
    enabled,
    demo,
    browserKey,
    placesKey,
    mapId: env.NEXT_PUBLIC_GOOGLE_MAP_ID || "DEMO_MAP_ID",
  };
}
