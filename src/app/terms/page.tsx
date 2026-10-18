import Link from "next/link";
export const metadata = { title: "Terms" };
export default function Terms() {
  return (
    <main
      tabIndex={-1}
      id="main"
      className="legal-page"
      style={{
        maxWidth: 760,
        margin: "4rem auto",
        padding: "0 24px",
        lineHeight: 1.8,
      }}
    >
      <Link href="/">← Diverse DMV home</Link>
      <h1>Terms and demonstration scope</h1>
      <p>
        Diverse DMV is a professional community prototype for the D.C., Maryland
        and Virginia region. This build is for fictional-account demonstrations
        and consenting tests. It is not an approved broader community launch.
      </p>
      <h2>Respect and consent</h2>
      <p>
        Create only your own profile or a clearly labeled fictional test
        profile. Share only content you have permission to share. Do not harass,
        impersonate, discriminate, send fraudulent opportunities, or evade
        another person’s interaction boundaries. Connections require acceptance;
        mentoring availability does not promise a response.
      </p>
      <h2>Professional information</h2>
      <p>
        Member information and hiring claims are self-reported. Recommendations
        are introductions to explore, not employment promises, endorsements,
        verified qualifications or compatibility scores. Fish appearance is
        cosmetic and has no effect on ranking.
      </p>
      <h2>Office listings</h2>
      <p>
        Google Maps office listings are provider data, may be incomplete or out
        of date, and do not establish hiring, partnership or membership in this
        community. Use of Google Maps is subject to the{" "}
        <a href="https://maps.google.com/help/terms_maps/">
          Google Maps/Google Earth Additional Terms of Service
        </a>{" "}
        and{" "}
        <a href="https://policies.google.com/terms">Google Terms of Service</a>.
      </p>
      <h2>Account and information controls</h2>
      <p>
        You can edit or unpublish your profile, remove connections, block
        members and request account deletion. A deletion request is not
        immediate erasure. Final retention, eligibility, moderation and support
        policies remain decisions for the project owner before admitting a
        broader community. No continuous moderation or response schedule is
        promised by this demonstration.
      </p>
      <p>
        Updated October 17, 2026.{" "}
        <Link href="/privacy">Privacy and your choices</Link>
      </p>
    </main>
  );
}
