import test from "node:test";
import assert from "node:assert/strict";
import {
  characterCount,
  emptyProfile,
  profileSchema,
  publishSchema,
  linkedinSchema,
} from "../src/shared/contracts";
test("Unicode count treats astral characters as one, combining marks explicitly separate", () => {
  assert.equal(characterCount("🪸🐟"), 2);
  assert.equal(characterCount("e\u0301"), 2);
});
test("newcomers can publish without professional credentials or private contacts", () => {
  const p = {
    ...emptyProfile("Alex Example"),
    intentions: ["networking" as const],
    hereFor: "Learn React",
    lookingToConnectWith: "People offering guidance",
    skills: ["React"],
  };
  assert.equal(publishSchema.safeParse(p).success, true);
  assert.equal(p.seekingVisibility, "private");
  assert.equal(p.mentoringAvailability, "paused");
});
test("drafts may be incomplete but publication requires every minimum field", () => {
  assert.equal(profileSchema.safeParse(emptyProfile()).success, true);
  const result = publishSchema.safeParse(emptyProfile());
  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.issues.length, 5);
});
test("URLs reject credential injection, deceptive LinkedIn hosts and active schemes", () => {
  for (const value of [
    "javascript:alert(1)",
    "https://linkedin.com.evil.test/in/x/",
    "https://evil@linkedin.com/in/x/",
    "http://linkedin.com/in/x/",
    "https://linkedin.com/company/x",
  ])
    assert.equal(linkedinSchema.safeParse(value).success, false, value);
  assert.equal(
    linkedinSchema.safeParse("https://www.linkedin.com/in/example/").success,
    true,
  );
});
test("schema rejects unknown privileged fields, oversized Unicode and unknown fish", () => {
  assert.equal(
    profileSchema.safeParse({ ...emptyProfile(), admin: true }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({
      ...emptyProfile(),
      displayName: "🐟".repeat(101),
    }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ ...emptyProfile(), fish: "premium" }).success,
    false,
  );
});
