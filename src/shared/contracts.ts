import { z } from "zod";

export const INTENTIONS = [
  "seeking",
  "hiring",
  "mentoring",
  "networking",
] as const;
export const INTENTION_LABELS = {
  seeking: "Seeking opportunities",
  hiring: "Hiring",
  mentoring: "Mentoring",
  networking: "Networking / exploring",
} as const;
export const FISH_VARIANTS = ["teal", "sunlight", "coral", "indigo"] as const;
export const characterCount = (value: string) => Array.from(value).length;
export const boundedText = (max: number) =>
  z
    .string()
    .refine((v) => characterCount(v) <= max, `Use ${max} characters or fewer.`);
const short = boundedText(160);
const prose = boundedText(1000);
const audience = z.enum(["private", "connections", "members"]);
const url = z.union([
  z.literal(""),
  boundedText(2048).refine((value) => {
    try {
      const u = new URL(value);
      return u.protocol === "https:" && !u.username && !u.password;
    } catch {
      return false;
    }
  }, "Enter a valid HTTPS URL."),
]);
export const linkedinSchema = url.refine((value) => {
  if (!value) return true;
  const u = new URL(value);
  return (
    ["linkedin.com", "www.linkedin.com"].includes(u.hostname) &&
    /^\/in\/[^/]+\/?$/.test(u.pathname)
  );
}, "Enter a LinkedIn profile URL, such as https://www.linkedin.com/in/example/.");
export const profileSchema = z
  .object({
    displayName: boundedText(100),
    headline: short,
    bio: prose,
    imageUrl: url,
    intentions: z.array(z.enum(INTENTIONS)).max(4),
    hereFor: boundedText(500),
    lookingToConnectWith: boundedText(500),
    skills: z
      .array(
        boundedText(50).refine((v) => !!v.trim(), "Enter a skill or interest."),
      )
      .max(20),
    lookingFor: prose,
    happyToHelp: prose,
    experienceLevel: short,
    employer: short,
    organization: short,
    education: prose,
    university: short,
    location: short,
    workPreferences: z.array(z.enum(["remote", "hybrid", "in_person"])).max(3),
    projects: z
      .array(z.object({ title: short, description: prose, url }).strict())
      .max(5),
    portfolioUrl: url,
    githubUrl: url,
    linkedinUrl: linkedinSchema,
    resumeUrl: url,
    desiredRoles: prose,
    opportunityTypes: prose,
    careerInterests: prose,
    nextStep: prose,
    hiringOrganization: short,
    hiringRelationship: short,
    opportunitySummary: prose,
    mentoringTopics: prose,
    mentoringAudience: prose,
    mentoringInteraction: prose,
    mentoringAvailability: z.enum(["paused", "accepting"]),
    learningGoals: prose,
    networkingInterests: prose,
    collaborationIdeas: prose,
    discussionTopics: prose,
    pronouns: short,
    identity: prose,
    affiliations: prose,
    seekingVisibility: audience,
    pronounsVisibility: audience,
    identityVisibility: audience,
    affiliationsVisibility: audience,
    fish: z.enum(FISH_VARIANTS),
    fictional: z.boolean(),
  })
  .strict();
export type ProfileData = z.infer<typeof profileSchema>;
export type Audience = z.infer<typeof audience>;
export const emptyProfile = (displayName = ""): ProfileData => ({
  displayName,
  headline: "",
  bio: "",
  imageUrl: "",
  intentions: [],
  hereFor: "",
  lookingToConnectWith: "",
  skills: [],
  lookingFor: "",
  happyToHelp: "",
  experienceLevel: "",
  employer: "",
  organization: "",
  education: "",
  university: "",
  location: "",
  workPreferences: [],
  projects: [],
  portfolioUrl: "",
  githubUrl: "",
  linkedinUrl: "",
  resumeUrl: "",
  desiredRoles: "",
  opportunityTypes: "",
  careerInterests: "",
  nextStep: "",
  hiringOrganization: "",
  hiringRelationship: "",
  opportunitySummary: "",
  mentoringTopics: "",
  mentoringAudience: "",
  mentoringInteraction: "",
  mentoringAvailability: "paused",
  learningGoals: "",
  networkingInterests: "",
  collaborationIdeas: "",
  discussionTopics: "",
  pronouns: "",
  identity: "",
  affiliations: "",
  seekingVisibility: "private",
  pronounsVisibility: "private",
  identityVisibility: "private",
  affiliationsVisibility: "private",
  fish: "teal",
  fictional: false,
});
export const publishSchema = profileSchema
  .refine((p) => !!p.displayName.trim(), {
    path: ["displayName"],
    message: "Enter your name.",
  })
  .refine((p) => p.intentions.length > 0, {
    path: ["intentions"],
    message: "Choose at least one intention.",
  })
  .refine((p) => !!p.hereFor.trim(), {
    path: ["hereFor"],
    message: "Tell us what you are here for.",
  })
  .refine((p) => !!p.lookingToConnectWith.trim(), {
    path: ["lookingToConnectWith"],
    message: "Tell us who you would like to meet.",
  })
  .refine((p) => p.skills.length > 0, {
    path: ["skills"],
    message: "Add a skill or interest.",
  });
type IndexingStatus = "pending" | "ready" | "failed" | "none";
export interface OwnProfile {
  id: string;
  data: ProfileData;
  version: number;
  cosmeticVersion: number;
  published: boolean;
  indexingStatus: IndexingStatus;
}
export type ProfileProjection = Partial<ProfileData> &
  Pick<ProfileData, "displayName" | "intentions" | "skills" | "fish">;
export interface MemberProfile {
  id: string;
  data: ProfileProjection;
  relationship: "none" | "incoming" | "outgoing" | "connected";
  requestId?: string;
  connectionId?: string;
  canMessage: boolean;
  retryAt?: string;
}
interface Recommendation extends MemberProfile {
  reason: string;
}
export interface RecommendationsResponse {
  status: "setup_required" | "indexing" | "ready";
  profiles: Recommendation[];
}
export interface Account {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  deletionRequest?: { id: string; status: string } | null;
}
export interface RequestItem {
  id: string;
  senderId: string;
  recipientId: string;
  introduction: string;
  createdAt: string;
  member: MemberProfile;
  status: string;
}
export interface ConnectionItem {
  id: string;
  member: MemberProfile;
  conversationId?: string | null;
}
export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  createdAt: string;
  clientOperationId: string;
}
export interface Conversation {
  id: string;
  recipientId: string;
  displayName: string;
  canMessage: boolean;
  latestMessage: string;
  updatedAt: string;
}
export interface MessagesResponse {
  conversation: Conversation;
  messages: Message[];
  before: string | null;
  after: string | null;
  hasMore: boolean;
}
