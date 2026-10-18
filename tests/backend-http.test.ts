import test from "node:test";
import assert from "node:assert/strict";
import { readJson, MAX_JSON_BODY_BYTES } from "../src/server/http";
import {
  emptyProfile,
  profileSchema,
  INTENTIONS,
} from "../src/shared/contracts";
function completeProfile(character: string) {
  const profile = emptyProfile(character.repeat(100));
  const short = [
    "headline",
    "experienceLevel",
    "employer",
    "organization",
    "university",
    "location",
    "hiringOrganization",
    "hiringRelationship",
    "pronouns",
  ] as const;
  const prose = [
    "bio",
    "lookingFor",
    "happyToHelp",
    "education",
    "desiredRoles",
    "opportunityTypes",
    "careerInterests",
    "nextStep",
    "opportunitySummary",
    "mentoringTopics",
    "mentoringAudience",
    "mentoringInteraction",
    "learningGoals",
    "networkingInterests",
    "collaborationIdeas",
    "discussionTopics",
    "identity",
    "affiliations",
  ] as const;
  for (const key of short) profile[key] = character.repeat(160);
  for (const key of prose) profile[key] = character.repeat(1000);
  profile.hereFor = character.repeat(500);
  profile.lookingToConnectWith = character.repeat(500);
  profile.skills = Array.from({ length: 20 }, () => character.repeat(50));
  const url = (prefix: string) =>
    prefix + character.repeat(2048 - Array.from(prefix).length);
  profile.imageUrl = url("https://example.invalid/");
  profile.portfolioUrl = url("https://example.invalid/");
  profile.githubUrl = url("https://example.invalid/");
  profile.linkedinUrl = url("https://www.linkedin.com/in/");
  profile.resumeUrl = url("https://example.invalid/");
  profile.projects = Array.from({ length: 5 }, () => ({
    title: character.repeat(160),
    description: character.repeat(1000),
    url: url("https://example.invalid/"),
  }));
  profile.intentions = [...INTENTIONS];
  profile.workPreferences = ["remote", "hybrid", "in_person"];
  return profileSchema.parse(profile);
}
function chunkedRequest(bytes: Uint8Array, chunkSize: number) {
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset === bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += Math.min(chunkSize, bytes.length - offset);
    },
  });
  return new Request("http://local.test/api/me/profile", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: stream,
    duplex: "half",
  } as RequestInit);
}
test("all valid profile fields at limits accept large Unicode, split UTF-8 and escaped surrogate encoding", async (t) => {
  const profile = completeProfile("🐠");
  const body = { version: 1, cosmeticVersion: 1, data: profile };
  const compact = JSON.stringify(body);
  const raw = new TextEncoder().encode(compact);
  assert.ok(raw.byteLength > 64_000);
  assert.ok(raw.byteLength < MAX_JSON_BODY_BYTES);
  assert.deepEqual(await readJson(chunkedRequest(raw, 4093)), body);
  // A serializer may escape every UTF-16 code unit, including supplementary surrogate pairs.
  const escaped = compact.replace(
    /[\u007f-\uffff]/g,
    (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"),
  );
  t.diagnostic(
    `Full-limit compact Unicode profile: ${raw.byteLength} bytes; escaped supplementary Unicode profile: ${Buffer.byteLength(escaped)} bytes.`,
  );
  assert.ok(Buffer.byteLength(escaped) > 500_000);
  assert.ok(Buffer.byteLength(escaped) < MAX_JSON_BODY_BYTES);
  assert.deepEqual(
    await readJson(chunkedRequest(new TextEncoder().encode(escaped), 8191)),
    body,
  );
});
test("stream without length stops and cancels once actual bytes exceed transport limit", async () => {
  for (const declaredLength of [undefined, "1"]) {
    let produced = 0,
      cancelled = false;
    const stream = new ReadableStream<Uint8Array>(
      {
        pull(controller) {
          produced++;
          controller.enqueue(new Uint8Array(65_536).fill(32));
        },
        cancel() {
          cancelled = true;
        },
      },
      { highWaterMark: 0 },
    );
    const request = new Request("http://local.test/api/me/profile", {
      method: "PATCH",
      headers: {
        "content-type": "application/json",
        ...(declaredLength ? { "content-length": declaredLength } : {}),
      },
      body: stream,
      duplex: "half",
    } as RequestInit);
    await assert.rejects(() => readJson(request), {
      status: 400,
      code: "VALIDATION_FAILED",
      message: "This request is too large.",
    });
    assert.equal(cancelled, true);
    assert.equal(produced, 17);
  }
});
test("known oversized length rejects before pulling any request bytes", async () => {
  let pulled = false,
    cancelled = false;
  const stream = new ReadableStream<Uint8Array>(
    {
      pull() {
        pulled = true;
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  const request = new Request("http://local.test/api/me/profile", {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "content-length": String(MAX_JSON_BODY_BYTES + 1),
    },
    body: stream,
    duplex: "half",
  } as RequestInit);
  await assert.rejects(() => readJson(request), {
    status: 400,
    code: "VALIDATION_FAILED",
  });
  assert.equal(pulled, false);
  assert.equal(cancelled, true);
});
test("malformed JSON and invalid UTF-8 produce content-free validation failures", async () => {
  for (const bytes of [
    new TextEncoder().encode('{"fictional":'),
    new Uint8Array([123, 34, 120, 34, 58, 34, 0xff, 34, 125]),
  ]) {
    await assert.rejects(() => readJson(chunkedRequest(bytes, 3)), {
      status: 400,
      code: "VALIDATION_FAILED",
      message: "Check the submitted information.",
    });
  }
});
