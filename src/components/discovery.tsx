"use client";
import Link from "next/link";
import { useResource } from "@/lib/client-api";
import type { RecommendationsResponse } from "@/shared/contracts";
import { useMember, ConnectionsNav } from "./app-shell";
import { Fish, Notice, PageTitle } from "./ui";
import BoatProfile from "./boat-profile";
import { RelationshipAction } from "./relationships";
export default function Discovery({
  dashboard = false,
}: {
  dashboard?: boolean;
}) {
  const { profile } = useMember();
  const results = useResource<RecommendationsResponse>("/api/recommendations");
  return (
    <>
      <PageTitle
        title={dashboard ? "Dashboard" : "Discover people"}
        eyebrow="Your DMV ocean"
      >
        <p>Find a conversation worth diving into.</p>
        <div className="actions">
          <Link href="/profile/edit">Edit matching preferences</Link>
          {dashboard && (
            <Link href="/connections/discover">See all in Connections</Link>
          )}
        </div>
      </PageTitle>
      {!dashboard && <ConnectionsNav />}
      <div className="ocean-toolbar">
        <h2>People to connect with</h2>
        <button
          className="secondary"
          style={{ color: "white", borderColor: "#dfa6c1" }}
          onClick={() => void results.reload()}
          disabled={results.loading}
        >
          ↻ {results.loading ? "Finding people…" : "Refresh people"}
        </button>
      </div>
      {results.loading && !results.data ? (
        <div className="panel">
          <Notice title="Finding people…" />
        </div>
      ) : results.error ? (
        <div className="panel">
          <Notice error title="Recommendations are unavailable right now.">
            <p>Your saved profile is safe. Try again.</p>
            <button onClick={() => void results.reload()}>
              Retry recommendations
            </button>
          </Notice>
        </div>
      ) : results.data?.status === "setup_required" ? (
        <div className="panel empty-state">
          <Fish />
          <h2>
            {!profile.published &&
            profile.data.intentions.length &&
            profile.data.hereFor &&
            profile.data.lookingToConnectWith &&
            profile.data.skills.length
              ? "Publish your profile to start discovery."
              : "Tell us who you’d like to meet."}
          </h2>
          <p>
            Add your intentions, Here for, Looking to connect with, and at least
            one skill or interest to get recommendations. Matching uses your
            member-visible inputs.
          </p>
          <Link className="button" href="/profile/setup">
            {profile.data.hereFor ? "Preview and publish" : "Complete profile"}
          </Link>
        </div>
      ) : results.data?.status === "indexing" ? (
        <div className="panel">
          <Notice title="Your matching information is still being prepared.">
            <p>Your saved profile is safe. Try again shortly.</p>
            <Link href="/profile">View profile status</Link>
          </Notice>
        </div>
      ) : results.data?.profiles.length ? (
        <ul className="boat-grid">
          {results.data.profiles.map((member) => (
            <li key={member.id}>
              <BoatProfile
                profile={{ ...member.data, id: member.id }}
                reason={member.reason}
                action={
                  <RelationshipAction
                    member={member}
                    onChange={() => void results.reload()}
                  />
                }
              />
            </li>
          ))}
        </ul>
      ) : (
        <div className="panel empty-state">
          <Fish />
          <h2>No people to show right now.</h2>
          <p>
            Try refreshing later or update who you’re looking to connect with.
          </p>
          <Link href="/profile/edit">Edit matching preferences</Link>
        </div>
      )}
    </>
  );
}
