/** Fictional fixtures only. Never run against a real-member environment. */
import { getSql } from "../src/server/db";
import { getFirebaseAuth } from "../src/server/firebase";
import { emptyProfile, type ProfileData } from "../src/shared/contracts";
import {
  enqueueProfileIndex,
  drainEmbeddingJobs,
} from "../src/server/embeddings";
const fixtures: {
  id: string;
  uid: string;
  email: string;
  data: ProfileData;
}[] = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    uid: "fictional-dmv-avery",
    email: "avery@example.test",
    data: {
      ...emptyProfile("Avery · fictional demo"),
      intentions: ["networking"],
      hereFor: "Learn accessible frontend development with React.",
      lookingToConnectWith:
        "Frontend developers who offer React and web accessibility mentoring.",
      skills: ["React", "Accessibility"],
      fictional: true,
    },
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    uid: "fictional-dmv-river",
    email: "river@example.test",
    data: {
      ...emptyProfile("River · fictional demo"),
      headline: "Frontend engineer offering accessible web guidance",
      intentions: ["mentoring", "networking"],
      hereFor: "Offer frontend mentoring and accessibility review.",
      lookingToConnectWith: "People learning React and web accessibility.",
      skills: ["React", "Web accessibility", "TypeScript"],
      happyToHelp:
        "React components, accessible HTML, keyboard navigation and frontend development",
      mentoringTopics:
        "React frontend engineering, web accessibility and TypeScript",
      mentoringAvailability: "accepting",
      fictional: true,
      fish: "sunlight",
    },
  },
  {
    id: "30000000-0000-4000-8000-000000000003",
    uid: "fictional-dmv-jules",
    email: "jules@example.test",
    data: {
      ...emptyProfile("Jules · fictional demo"),
      headline: "Data engineer offering PostgreSQL and pipeline guidance",
      intentions: ["mentoring", "networking"],
      hereFor: "Offer data engineering mentorship with Python and SQL.",
      lookingToConnectWith:
        "People learning database pipelines and data engineering.",
      skills: ["Python", "PostgreSQL", "Data engineering"],
      happyToHelp: "Database design, PostgreSQL tuning, SQL and data pipelines",
      mentoringTopics:
        "PostgreSQL, Python data engineering, SQL and database pipelines",
      mentoringAvailability: "accepting",
      fictional: true,
      fish: "coral",
    },
  },
];
async function main() {
  if (process.env.ALLOW_FICTIONAL_SEED !== "true")
    throw new Error(
      "Set ALLOW_FICTIONAL_SEED=true only in a demo/test database.",
    );
  const localOnly = process.argv.includes("--local-database-only");
  if (
    !localOnly &&
    (!process.env.DEMO_ACCOUNT_PASSWORD ||
      process.env.DEMO_ACCOUNT_PASSWORD.length < 12)
  )
    throw new Error(
      "DEMO_ACCOUNT_PASSWORD of at least 12 characters required.",
    );
  const sql = getSql();
  for (const fixture of fixtures) {
    if (!localOnly) {
      const auth = getFirebaseAuth();
      try {
        await auth.getUser(fixture.uid);
      } catch (e) {
        if ((e as { code?: string }).code !== "auth/user-not-found") throw e;
        await auth.createUser({
          uid: fixture.uid,
          email: fixture.email,
          displayName: fixture.data.displayName,
          password: process.env.DEMO_ACCOUNT_PASSWORD,
        });
      }
    }
    await sql.begin(async (tx) => {
      await tx`INSERT INTO accounts(id,auth_uid,name,email) VALUES(${fixture.id},${fixture.uid},${fixture.data.displayName},${fixture.email}) ON CONFLICT(id) DO NOTHING`;
      const existing = (
        await tx`SELECT p.account_id,p.data,a.auth_uid FROM profiles p JOIN accounts a ON a.id=p.account_id WHERE p.account_id=${fixture.id}`
      )[0];
      if (
        existing &&
        (!existing.data.fictional || existing.auth_uid !== fixture.uid)
      )
        throw new Error(
          "Fixture collision; refusing to replace a real profile.",
        );
      // Existing fixture edits and conversations are deliberately preserved.
      if (existing) return;
      await tx`INSERT INTO profiles(account_id,data,published,indexing_status) VALUES(${fixture.id},${tx.json(fixture.data)},true,'pending')`;
      await enqueueProfileIndex(tx, fixture.id, 1);
    });
  }
  const indexing = await drainEmbeddingJobs(10);
  console.log(
    JSON.stringify(
      {
        mode: localOnly
          ? "Database-only fictional fixtures; no Firebase login provisioned"
          : "Firebase-backed fictional fixtures",
        accounts: fixtures.map((f) => ({ id: f.id, email: f.email })),
        indexing,
      },
      null,
      2,
    ),
  );
  await sql.end();
}
main().catch(() => {
  console.error(
    "Fictional seed failed. Verify demo configuration/provider access. No credentials printed.",
  );
  process.exitCode = 1;
});
