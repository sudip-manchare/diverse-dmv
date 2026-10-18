"use client";
import Link from "next/link";
import { useResource, mutation } from "@/lib/client-api";
import { useState } from "react";
import type {
  ProfileProjection,
  OwnProfile,
  MemberProfile,
} from "@/shared/contracts";
import { Avatar, Fish, Tags, Notice, PageTitle, ErrorPanel } from "./ui";
import { RelationshipAction, ConfirmAction } from "./relationships";
export function ProfileContent({ data }: { data: ProfileProjection }) {
  const fields: [keyof ProfileProjection, string][] = [
    ["hereFor", "Here for"],
    ["lookingToConnectWith", "Looking to connect with"],
    ["bio", "About"],
    ["lookingFor", "Looking for"],
    ["happyToHelp", "Happy to help with"],
    ["experienceLevel", "Experience"],
    ["employer", "Employer"],
    ["organization", "Organization"],
    ["education", "Education"],
    ["university", "University affiliation"],
    ["location", "Broad location"],
    ["desiredRoles", "Desired roles"],
    ["opportunityTypes", "Opportunity types"],
    ["careerInterests", "Career interests"],
    ["nextStep", "Next step"],
    ["hiringOrganization", "Hiring organization"],
    ["hiringRelationship", "Relationship to organization"],
    ["opportunitySummary", "Opportunity summary"],
    ["mentoringTopics", "Mentoring topics"],
    ["mentoringAudience", "Who I can support"],
    ["mentoringInteraction", "Preferred interaction"],
    ["learningGoals", "Learning goals"],
    ["networkingInterests", "Interests"],
    ["collaborationIdeas", "Collaboration ideas"],
    ["discussionTopics", "Discussion topics"],
    ["pronouns", "Pronouns"],
    ["identity", "Self-described identity"],
    ["affiliations", "Community affiliations"],
  ];
  return (
    <div className="profile-body">
      <div className="profile-header">
        <Avatar name={data.displayName} imageUrl={data.imageUrl} />
        <div>
          <h2>{data.displayName}</h2>
          {data.headline && <p>{data.headline}</p>}
          {data.fictional && <p className="help">Fictional demo profile</p>}
        </div>
        <Fish variant={data.fish} />
      </div>
      <Tags items={data.intentions} />
      <div className="skill-tags">
        {data.skills.map((t) => (
          <span key={t}>{t}</span>
        ))}
      </div>
      {data.intentions.includes("hiring") && (
        <p className="help">Hiring information is self-reported.</p>
      )}
      {data.intentions.includes("mentoring") &&
        data.mentoringAvailability === "paused" && (
          <p className="help">Not accepting new mentoring requests.</p>
        )}
      {fields
        .filter(([key]) => typeof data[key] === "string" && data[key])
        .map(([key, label]) => (
          <section key={key}>
            <h2>{label}</h2>
            <p>{String(data[key])}</p>
          </section>
        ))}
      {!!data.workPreferences?.length && (
        <section>
          <h2>Work preferences</h2>
          <p>
            {data.workPreferences
              .map(
                (v) =>
                  ({
                    remote: "Remote",
                    hybrid: "Hybrid",
                    in_person: "In person",
                  })[v],
              )
              .join(" · ")}
          </p>
        </section>
      )}
      {!!data.projects?.length && (
        <section>
          <h2>Projects and work samples</h2>
          {data.projects.map((p, i) => (
            <div key={i}>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
              {p.url && (
                <a href={p.url} target="_blank" rel="noopener noreferrer">
                  View {p.title || "project"} (external)
                </a>
              )}
            </div>
          ))}
        </section>
      )}
      {[
        ["portfolioUrl", "Portfolio"],
        ["githubUrl", "GitHub"],
        ["linkedinUrl", "LinkedIn profile"],
        ["resumeUrl", "Résumé"],
      ].some(([key]) => data[key as keyof ProfileProjection]) && (
        <section>
          <h2>Links</h2>
          <div className="actions">
            {[
              ["portfolioUrl", "Portfolio"],
              ["githubUrl", "GitHub"],
              ["linkedinUrl", "LinkedIn profile"],
              ["resumeUrl", "Résumé"],
            ].map(([key, label]) =>
              data[key as keyof ProfileProjection] ? (
                <a
                  key={key}
                  href={String(data[key as keyof ProfileProjection])}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${data.displayName}’s ${label} (external)`}
                >
                  {label} ↗
                </a>
              ) : null,
            )}
          </div>
        </section>
      )}
    </div>
  );
}
function IndexingNotice({
  profile,
  onChange,
}: {
  profile: OwnProfile;
  onChange: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const text = !profile.published
    ? "Only you can view this profile."
    : profile.indexingStatus === "ready"
      ? "Your profile is ready for discovery."
      : profile.indexingStatus === "failed"
        ? "Members can view your profile, but it isn’t ready for discovery. Retry preparing it."
        : "Members can view your profile. It’s being prepared for discovery.";
  return (
    <Notice title={text}>
      {profile.published && profile.indexingStatus !== "ready" && (
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await mutation("/api/me/profile/reindex", {
                version: profile.version,
              });
              onChange();
            } catch {
              setError(
                "We couldn’t request preparation. Your profile changes are saved. Try again.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Requesting…" : "Retry indexing"}
        </button>
      )}
      {error && <p>{error}</p>}
    </Notice>
  );
}
export function OwnProfilePage() {
  const resource = useResource<{
    profile: OwnProfile;
    previews: { member: ProfileProjection; connection: ProfileProjection };
  }>("/api/me/profile");
  const [audience, setAudience] = useState<"member" | "connection">("member");
  return (
    <>
      <PageTitle title="My profile" eyebrow="Make yourself known">
        <p>Your intentions can overlap. Your profile can evolve.</p>
      </PageTitle>
      {resource.error ? (
        <ErrorPanel error={resource.error} retry={resource.reload} />
      ) : resource.data ? (
        <div className="panel">
          <IndexingNotice
            profile={resource.data.profile}
            onChange={() => void resource.reload()}
          />
          <div className="actions" style={{ marginBottom: "2rem" }}>
            <Link className="button" href="/profile/edit">
              Edit profile
            </Link>
            <Link className="button secondary" href="/profile/edit?preview=1">
              {resource.data.profile.published
                ? "Preview profile"
                : "Preview and publish"}
            </Link>
            <Link href="/dashboard">Go to dashboard</Link>
          </div>
          <div className="field">
            <label htmlFor="view-audience">View as</label>
            <select
              id="view-audience"
              value={audience}
              onChange={(e) =>
                setAudience(e.target.value as "member" | "connection")
              }
            >
              <option value="member">Member</option>
              <option value="connection">Connection</option>
            </select>
            <p className="help">
              {audience === "member" ? "Member" : "Connection"} preview. Account
              email and phone are never included.
            </p>
          </div>
          <ProfileContent data={resource.data.previews[audience]} />
          {resource.data.profile.published && (
            <div className="actions">
              <ConfirmAction
                label="Unpublish profile"
                title="Unpublish your profile?"
                description="Other members won’t be able to view or discover your profile. New messages will stop. Existing conversations remain readable unless blocked."
                path="/api/me/profile/unpublish"
                idempotency="version"
                cancelLabel="Keep published"
                body={{ version: resource.data.profile.version }}
                onDone={() => void resource.reload()}
              />
            </div>
          )}
        </div>
      ) : (
        <Notice title="Loading your information…" />
      )}
    </>
  );
}
export function MemberProfilePage({ id }: { id: string }) {
  const result = useResource<{ profile: MemberProfile }>(`/api/profiles/${id}`);
  return (
    <>
      <PageTitle
        title={result.data?.profile.data.displayName || "Member profile"}
      >
        <Link href="/connections/discover">Back to Discover</Link>
      </PageTitle>
      {result.error ? (
        <ErrorPanel
          error={result.error}
          retry={result.reload}
          unavailable="This profile is unavailable."
        />
      ) : result.data ? (
        <div className="panel">
          <div
            className="actions"
            style={{ marginTop: 0, marginBottom: "2rem" }}
          >
            <RelationshipAction
              member={result.data.profile}
              onChange={() => void result.reload()}
            />
            <ConfirmAction
              label="Block member"
              title={`Block ${result.data.profile.data.displayName}?`}
              description="You won’t be able to view each other’s profiles, connect or message. Existing conversations will be hidden. Unblocking won’t restore your connection."
              path="/api/blocks"
              body={{ blockedId: id }}
              onDone={() => void result.reload()}
            />
          </div>
          <ProfileContent data={result.data.profile.data} />
        </div>
      ) : (
        <Notice title="Loading profile…" />
      )}
    </>
  );
}
