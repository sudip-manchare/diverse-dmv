import Link from "next/link";
export const metadata = { title: "Privacy" };
export default function Privacy() {
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
      <h1>Privacy and your choices</h1>
      <p>
        This build is intended for demonstrations with fictional profiles or
        consenting test participants. Broader community access, retention
        periods and support ownership must be agreed before public membership
        opens.
      </p>
      <h2>Profiles and account access</h2>
      <p>
        Firebase handles sign-in and password recovery. Your account email and
        optional phone are private. Saving a profile does not publish it.
        Publishing shares selected details with signed-in members; seeking and
        identity audiences can be chosen independently. Accepting a connection
        does not share your email or phone.
      </p>
      <h2>Matching</h2>
      <p>
        Member-visible professional text is sent to Google Gemini to create
        numerical representations for matching. Identity fields, private and
        connection-only fields, account contacts, messages and fish appearance
        are excluded. A member-visible free-text field can still reveal
        information you type into it: review your previews before publishing.
      </p>
      <h2>Conversations and controls</h2>
      <p>
        Messages are stored for authorized participants. Removing a connection
        stops new messages while preserving history. Blocking hides the
        conversation from both participants; unblocking does not reconnect you.
        Unpublishing stops new messages and hides your profile. Requesting
        account deletion records a request for processing; it does not promise
        immediate erasure or removal from another participant’s retained
        history.
      </p>
      <h2>Office exploration</h2>
      <p>
        The office explorer loads Google Maps and initial DMV office listings
        when you open a page containing it. Google receives the network and
        browser information needed to provide its map. Office search uses the
        area and company name you enter; it does not request your location or
        send private member profiles or messages. Office results are transient
        provider content and are not a complete directory or evidence of hiring.
      </p>
      <p>
        See{" "}
        <a href="https://policies.google.com/privacy">
          Google’s Privacy Policy
        </a>{" "}
        and{" "}
        <a href="https://maps.google.com/help/terms_maps/">Google Maps terms</a>
        . Provider policy and key restrictions must be reviewed by the deploying
        project owner before enabling the explorer.
      </p>
      <h2>Local drafts</h2>
      <p>
        Unsaved text may be lost when you close or reload the page. Only a
        successful save confirms persistence. The application does not use
        message-body analytics or store unsaved contacts and messages in browser
        local storage.
      </p>
      <p>
        Updated October 17, 2026.{" "}
        <Link href="/terms">Terms and demonstration scope</Link>
      </p>
    </main>
  );
}
