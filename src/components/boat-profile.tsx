"use client";
import Link from "next/link";
import { Avatar, Fish, Tags } from "./ui";
export default function BoatProfile({
  profile,
  reason,
  action,
}: {
  profile: any;
  reason?: string;
  action?: React.ReactNode;
}) {
  return (
    <article className="boat-profile">
      <div className="boat-cabin">
        <div className="profile-heading">
          <Avatar name={profile.displayName} imageUrl={profile.imageUrl} />
          <div>
            <p className="eyebrow">
              {profile.fictional ? "Fictional demo profile" : "Your community"}
            </p>
            <h3>
              <Link href={`/members/${profile.id || profile.accountId}`}>
                {profile.displayName}
              </Link>
            </h3>
            {profile.headline && <p>{profile.headline}</p>}
          </div>
        </div>
        <Tags items={profile.intentions} />
        {profile.hereFor && <p className="boat-intro">{profile.hereFor}</p>}
        <div className="skill-tags">
          {(profile.skills || profile.tags || [])
            .slice(0, 5)
            .map((t: string) => (
              <span key={t}>{t}</span>
            ))}
        </div>
        {reason && (
          <p className="reason">
            <span aria-hidden="true">↗</span> {reason}
          </p>
        )}
        <div className="actions">
          <Link
            className="button secondary"
            href={`/members/${profile.id || profile.accountId}`}
            aria-label={`View ${profile.displayName}’s profile`}
          >
            View profile
          </Link>
          {action}
        </div>
      </div>
      <div className="boat-hull" aria-hidden="true">
        <svg viewBox="0 0 500 75" preserveAspectRatio="none">
          <path
            d="M1 1h498l-40 49q-14 20-40 20H81q-26 0-40-20z"
            fill="#f9a8c9"
          />
          <path d="M25 26h450" stroke="#4c102b" strokeWidth="3" opacity=".5" />
          <circle cx="80" cy="46" r="8" fill="#4c102b" />
          <circle cx="420" cy="46" r="8" fill="#4c102b" />
        </svg>
        <Fish variant={profile.fish || "teal"} />
      </div>
    </article>
  );
}
