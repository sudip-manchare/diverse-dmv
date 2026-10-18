import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyProfile } from "../src/shared/contracts";
import {
  boundedDocument,
  candidateDocument,
  queryDocument,
  normalizedVector,
  sourceHash,
} from "../src/server/embeddings";
import {
  officeInputSchema,
  insideCircle,
  areaRectangle,
  matchesCompanyName,
} from "../src/server/offices";
test("embedding allowlist excludes identity, contact, cosmetics, private seeking and paused mentoring", () => {
  const p = {
    ...emptyProfile("SECRET_NAME"),
    intentions: ["seeking", "mentoring"] as ("seeking" | "mentoring")[],
    skills: ["React"],
    hereFor: "Learn frontend",
    lookingToConnectWith: "Accessibility mentors",
    pronouns: "SECRET_PRONOUNS",
    identity: "SECRET_IDENTITY",
    desiredRoles: "SECRET_PRIVATE_SEEKING",
    mentoringTopics: "SECRET_PAUSED_MENTOR",
    fish: "coral" as const,
  };
  const document = candidateDocument(p);
  assert.ok(!document.includes("SECRET_"));
  assert.ok(!document.includes("coral"));
  assert.ok(document.includes("React"));
  p.mentoringAvailability = "accepting";
  assert.ok(candidateDocument(p).includes("SECRET_PAUSED_MENTOR"));
  p.seekingVisibility = "members";
  assert.ok(candidateDocument(p).includes("SECRET_PRIVATE_SEEKING"));
});
test("matching input changes the query key and Unicode byte budget is bounded", () => {
  const p = {
    ...emptyProfile(),
    intentions: ["networking"] as const as unknown as ["networking"],
    skills: ["React"],
    hereFor: "Learn frontend",
    lookingToConnectWith: "Accessibility mentors",
  };
  assert.notEqual(
    sourceHash(queryDocument(p)),
    sourceHash(
      queryDocument({
        ...p,
        lookingToConnectWith: "Quantum computing researchers",
      }),
    ),
  );
  assert.ok(Buffer.byteLength(boundedDocument(["🧑🏽‍💻".repeat(1000)])) <= 1800);
  assert.equal(queryDocument({ ...p, hereFor: "" }), "");
});
test("vectors reject wrong dimensions, nonfinite and zero; normalized output unit length", () => {
  for (const values of [
    [],
    Array(768).fill(0),
    Array(768).fill(NaN),
    Array(767).fill(1),
  ])
    assert.throws(() => normalizedVector(values));
  assert.ok(
    Math.abs(Math.hypot(...normalizedVector(Array(768).fill(2))) - 1) < 1e-10,
  );
});
test("office proxy rejects unsupported bounds, ambiguous modes and overlong search", () => {
  for (const input of [
    { area: { lat: 40, lng: -77, radius: 1000 } },
    { area: { lat: 39, lng: -77, radius: 51000 } },
    { preset: "metro", area: { lat: 39, lng: -77, radius: 1000 } },
    { company: "x".repeat(81) },
    { url: "https://attacker.test" },
  ])
    assert.equal(officeInputSchema.safeParse(input).success, false);
  const area = { lat: 38.9, lng: -77, radius: 1000 };
  assert.equal(insideCircle(area, 38.9, -77), true);
  assert.equal(insideCircle(area, 39.1, -77), false);
  const r = areaRectangle(area);
  assert.ok(r.low.latitude < area.lat && r.high.latitude > area.lat);
});
test("office company filtering rejects related names and combines with geographic bounds", () => {
  assert(matchesCompanyName("Google Reston", " google "));
  assert(matchesCompanyName("Nestlé USA, Inc.", "NESTLE USA"));
  assert(matchesCompanyName("T. Rowe Price HQ", "t rowe price"));
  assert(
    matchesCompanyName("AWS WAS17 - Amazon Merlin building", "Amazon AWS"),
  );
  assert(matchesCompanyName("Capital One", ""));
  assert(!matchesCompanyName("Capital One", "Google"));
  assert(!matchesCompanyName("Amazon", "Amazon Microsoft"));
  assert(!matchesCompanyName("Google", "!!!"));
  const area = { lat: 38.9, lng: -77, radius: 1000 };
  const candidates = [
    { name: "Google local", lat: 38.9, lng: -77 },
    { name: "Google outside", lat: 39.29, lng: -76.61 },
    { name: "Other local", lat: 38.9, lng: -77 },
  ];
  assert.deepEqual(
    candidates
      .filter(
        (office) =>
          insideCircle(area, office.lat, office.lng) &&
          matchesCompanyName(office.name, "Google"),
      )
      .map((office) => office.name),
    ["Google local"],
  );
});
