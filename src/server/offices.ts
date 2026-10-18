import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import {
  OFFICE_PRESETS,
  type OfficeArea,
  type Office,
  type OfficeSearchResponse,
} from "@/lib/office-contract";
import { ApiError } from "./http";
import { takeProviderBudget } from "./provider-budget";
import { officeConfig } from "./office-config";
import { characterCount } from "@/shared/contracts";

const areaSchema = z
  .object({
    lat: z.number().min(37.7).max(39.8),
    lng: z.number().min(-78.3).max(-75),
    radius: z.number().min(500).max(50000),
  })
  .strict();
export const officeInputSchema = z
  .object({
    preset: z
      .enum(["metro", "dc", "maryland", "virginia", "baltimore"])
      .optional(),
    area: areaSchema.optional(),
    company: z
      .string()
      .trim()
      .refine(
        (value) => characterCount(value) <= 80,
        "Use 80 characters or fewer.",
      )
      .optional(),
    pageToken: z.string().max(5000).optional(),
  })
  .strict()
  .refine((v) => !(v.preset && v.area), "Choose a preset or a map area.");
const FIELDS =
  "places.id,places.displayName,places.location,places.formattedAddress,places.types,places.businessStatus,places.googleMapsUri,places.attributions";
export function matchesCompanyName(name: string, company: string) {
  if (!company.trim()) return true;
  const normalize = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim();
  const terms = normalize(company).split(" ").filter(Boolean);
  const normalizedName = normalize(name);
  return (
    terms.length > 0 && terms.every((term) => normalizedName.includes(term))
  );
}
type PageContext = { token: string; hash: string; page: number; exp: number };
function signingSecret() {
  const secret = process.env.OFFICE_PAGE_TOKEN_SECRET;
  if (!secret || secret.length < 32)
    throw new ApiError(503, "OFFICE_UNAVAILABLE");
  return secret;
}
function digest(value: string) {
  return createHmac("sha256", signingSecret())
    .update(value)
    .digest("base64url");
}
function pack(context: PageContext) {
  const value = Buffer.from(JSON.stringify(context)).toString("base64url");
  return `${value}.${digest(value)}`;
}
function unpack(value: string, hash: string): PageContext {
  try {
    const [data, signature, extra] = value.split(".");
    const actual = Buffer.from(digest(data));
    const supplied = Buffer.from(signature ?? "");
    if (
      extra ||
      supplied.length !== actual.length ||
      !timingSafeEqual(actual, supplied)
    )
      throw new Error();
    const p = JSON.parse(
      Buffer.from(data, "base64url").toString(),
    ) as PageContext;
    if (
      p.hash !== hash ||
      p.exp < Date.now() ||
      p.page < 1 ||
      p.page > 2 ||
      typeof p.token !== "string"
    )
      throw new Error();
    return p;
  } catch {
    throw new ApiError(
      400,
      "INVALID_PAGE_TOKEN",
      "This office search has expired. Search again.",
    );
  }
}
export function areaRectangle(area: OfficeArea) {
  const latDelta = area.radius / 111320;
  const lngDelta =
    area.radius / (111320 * Math.cos((area.lat * Math.PI) / 180));
  return {
    low: {
      latitude: Math.max(37.7, area.lat - latDelta),
      longitude: Math.max(-78.3, area.lng - lngDelta),
    },
    high: {
      latitude: Math.min(39.8, area.lat + latDelta),
      longitude: Math.min(-75, area.lng + lngDelta),
    },
  };
}
export function insideCircle(area: OfficeArea, lat: number, lng: number) {
  const radians = Math.PI / 180;
  const a =
    Math.sin(((lat - area.lat) * radians) / 2) ** 2 +
    Math.cos(area.lat * radians) *
      Math.cos(lat * radians) *
      Math.sin(((lng - area.lng) * radians) / 2) ** 2;
  return (
    6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) <= area.radius &&
    lat >= 37.7 &&
    lat <= 39.8 &&
    lng >= -78.3 &&
    lng <= -75
  );
}
function webUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const u = new URL(value);
    return u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}
export async function searchOffices(
  raw: unknown,
  request: Request,
): Promise<OfficeSearchResponse> {
  const input = officeInputSchema.parse(raw);
  const config = officeConfig();
  if (!config.enabled || !config.placesKey)
    throw new ApiError(503, "OFFICE_UNAVAILABLE");
  const origin = request.headers.get("origin");
  if (
    !origin ||
    origin !== new URL(process.env.APP_ORIGIN || request.url).origin
  )
    throw new ApiError(403, "ORIGIN_DENIED");
  const area = input.area ?? OFFICE_PRESETS[input.preset ?? "metro"];
  const company = input.company?.trim() || "";
  const query = {
    area: { lat: area.lat, lng: area.lng, radius: area.radius },
    company,
  };
  const hash = digest(JSON.stringify(query));
  const page = input.pageToken ? unpack(input.pageToken, hash) : undefined;
  if (page && !company) throw new ApiError(400, "INVALID_PAGE_TOKEN");
  // Vercel overwrites x-forwarded-for at its edge. Outside that deployment,
  // do not trust client-supplied proxy headers; use a conservative shared bucket.
  // Global budgets remain authoritative. Never store raw IP addresses.
  const ip =
    (process.env.VERCEL === "1"
      ? request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
      : undefined) || "unknown";
  await takeProviderBudget(`offices-client-${digest(ip)}`, 10, 60);
  await takeProviderBudget("offices-global-minute", 60, 60);
  await takeProviderBudget(
    "offices-global-day",
    Math.max(
      1,
      Math.min(10000, Number(process.env.OFFICE_DAILY_CALL_LIMIT) || 500),
    ),
    86400,
  );
  const body = company
    ? {
        textQuery: `${company} corporate office`,
        includedType: "corporate_office",
        strictTypeFiltering: true,
        locationRestriction: { rectangle: areaRectangle(area) },
        pageSize: 20,
        ...(page ? { pageToken: page.token } : {}),
      }
    : {
        includedTypes: ["corporate_office"],
        maxResultCount: 20,
        locationRestriction: {
          circle: {
            center: { latitude: area.lat, longitude: area.lng },
            radius: area.radius,
          },
        },
      };
  let response: Response;
  try {
    response = await fetch(
      `https://places.googleapis.com/v1/places:${company ? "searchText" : "searchNearby"}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": config.placesKey,
          "X-Goog-FieldMask": FIELDS + (company ? ",nextPageToken" : ""),
        },
        body: JSON.stringify(body),
        cache: "no-store",
        signal: AbortSignal.timeout(12000),
      },
    );
  } catch {
    throw new ApiError(503, "OFFICE_UNAVAILABLE");
  }
  if (!response.ok)
    throw new ApiError(
      response.status === 429 ? 429 : 503,
      "OFFICE_UNAVAILABLE",
    );
  const result = (await response.json()) as {
    places?: Record<string, unknown>[];
    nextPageToken?: string;
  };
  const offices: Office[] = [];
  for (const p of result.places ?? []) {
    const loc = p.location as
      { latitude?: number; longitude?: number } | undefined;
    const lat = loc?.latitude,
      lng = loc?.longitude;
    if (
      typeof p.id !== "string" ||
      typeof lat !== "number" ||
      typeof lng !== "number" ||
      !insideCircle(area, lat, lng) ||
      p.businessStatus === "CLOSED_PERMANENTLY" ||
      offices.some((o) => o.id === p.id)
    )
      continue;
    const name = (p.displayName as { text?: string } | undefined)?.text;
    // Google text search can suggest related places: enforce company AND area.
    if (!name || !matchesCompanyName(name, company)) continue;
    offices.push({
      id: p.id,
      name,
      address:
        typeof p.formattedAddress === "string" ? p.formattedAddress : null,
      lat,
      lng,
      types: Array.isArray(p.types)
        ? p.types.filter((v): v is string => typeof v === "string")
        : [],
      businessStatus:
        typeof p.businessStatus === "string" ? p.businessStatus : "UNKNOWN",
      mapsUri:
        webUrl(p.googleMapsUri) ??
        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}&query_place_id=${encodeURIComponent(p.id)}`,
      attributions: Array.isArray(p.attributions)
        ? p.attributions.map((a) => ({
            provider:
              typeof a.provider === "string" ? a.provider : "Data provider",
            uri: webUrl(a.providerUri),
          }))
        : [],
    });
  }
  return {
    offices,
    area: { lat: area.lat, lng: area.lng, radius: area.radius },
    areaLabel: input.area
      ? "Selected map area"
      : OFFICE_PRESETS[input.preset ?? "metro"].label,
    mode: company ? "company" : "nearby",
    ...(result.nextPageToken && company && (page?.page ?? 0) < 2
      ? {
          nextPageToken: pack({
            token: result.nextPageToken,
            hash,
            page: (page?.page ?? 0) + 1,
            exp: Date.now() + 10 * 60 * 1000,
          }),
        }
      : {}),
  };
}
