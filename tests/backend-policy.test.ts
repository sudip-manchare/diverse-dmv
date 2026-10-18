import test from "node:test";
import assert from "node:assert/strict";
import { emptyProfile } from "../src/shared/contracts";
import { projectProfileData, canonicalPair } from "../src/server/policy";
import { phoneSchema } from "../src/server/validation";
test("member/connection projections omit private data and scopes, retaining public cosmetic", () => {
  const p = emptyProfile("Fictional Member");
  Object.assign(p, {
    intentions: ["seeking", "mentoring"],
    desiredRoles: "PRIVATE SEEKING",
    pronouns: "they/them",
    pronounsVisibility: "connections",
    identity: "PRIVATE IDENTITY",
    fish: "coral",
  });
  const member = projectProfileData(p, "member");
  assert.equal(member.pronouns, undefined);
  assert.equal(member.identity, undefined);
  assert.equal(member.desiredRoles, undefined);
  assert.deepEqual(member.intentions, ["mentoring"]);
  assert.equal(member.fish, "coral");
  assert.equal(member.seekingVisibility, undefined);
  const connection = projectProfileData(p, "connection");
  assert.equal(connection.pronouns, "they/them");
  assert.equal(connection.identity, undefined);
  assert.equal(connection.desiredRoles, undefined);
  assert.equal(projectProfileData(p, "owner").identity, "PRIVATE IDENTITY");
  assert.equal(p.identity, "PRIVATE IDENTITY");
});
test("inactive role fields never appear; independent scopes retain allowed seeking", () => {
  const p = emptyProfile("Fictional");
  Object.assign(p, {
    intentions: ["seeking"],
    seekingVisibility: "members",
    desiredRoles: "Developer",
    hiringOrganization: "Inactive organization",
    mentoringTopics: "Inactive topics",
  });
  const out = projectProfileData(p, "member");
  assert.equal(out.desiredRoles, "Developer");
  assert.equal(out.hiringOrganization, undefined);
  assert.equal(out.mentoringTopics, undefined);
});
test("international phone preserves country and rejects inferred country or extensions", () => {
  assert.equal(phoneSchema.parse("+1 (202) 555-0123"), "+12025550123");
  assert.equal(phoneSchema.parse(""), "");
  assert.equal(phoneSchema.safeParse("2025550123").success, false);
  assert.equal(phoneSchema.safeParse("+1 202 555 0123 ext 4").success, false);
});
test("pair normalization is symmetric", () => {
  assert.deepEqual(canonicalPair("b", "a"), canonicalPair("a", "b"));
});
