import type {
  ProfileData,
  ProfileProjection,
  Audience,
} from "@/shared/contracts";
export type ViewerAudience = "owner" | "member" | "connection";
const canReadScope = (scope: Audience, audience: ViewerAudience) =>
  audience === "owner" ||
  scope === "members" ||
  (scope === "connections" && audience === "connection");
export function projectProfileData(
  data: ProfileData,
  audience: ViewerAudience,
): ProfileProjection {
  if (audience === "owner") return structuredClone(data);
  const out: Partial<ProfileData> = structuredClone(data);
  delete out.seekingVisibility;
  delete out.pronounsVisibility;
  delete out.identityVisibility;
  delete out.affiliationsVisibility;
  if (!canReadScope(data.seekingVisibility, audience)) {
    out.intentions = data.intentions.filter((v) => v !== "seeking");
    delete out.desiredRoles;
    delete out.opportunityTypes;
    delete out.careerInterests;
    delete out.nextStep;
  }
  for (const field of ["pronouns", "identity", "affiliations"] as const)
    if (!canReadScope(data[`${field}Visibility`], audience)) delete out[field];
  if (!data.intentions.includes("seeking")) {
    delete out.desiredRoles;
    delete out.opportunityTypes;
    delete out.careerInterests;
    delete out.nextStep;
  }
  if (!data.intentions.includes("hiring")) {
    delete out.hiringOrganization;
    delete out.hiringRelationship;
    delete out.opportunitySummary;
  }
  if (!data.intentions.includes("mentoring")) {
    delete out.mentoringTopics;
    delete out.mentoringAudience;
    delete out.mentoringInteraction;
    delete out.mentoringAvailability;
  }
  if (!data.intentions.includes("networking")) {
    delete out.learningGoals;
    delete out.networkingInterests;
    delete out.collaborationIdeas;
    delete out.discussionTopics;
  }
  return out as ProfileProjection;
}
export const canonicalPair = (a: string, b: string): [string, string] =>
  a < b ? [a, b] : [b, a];
