# One Next.js application: Vercel preferred, portable Docker optional

For the requested **direct setup against the existing services**, use [Direct Docker deployment](DOCKER.md). The Compose file runs only the app; it does not perform migrations, create demo data, or provision additional services. The provider-specific and schema-maintenance procedures below are optional reference material.

The owner's latest preference is **Vercel**, superseding Cloud Run and the interim Render option. [vercel.json](../vercel.json) prepares one Next.js project with its UI and route handlers on the same origin; Vercel may execute routes as managed functions within that project. Firebase, Gemini and the existing Tiger Data database remain external providers. No hosting resource, paid plan, API activation or domain purchase has been performed. Public deployment remains **unverified**. The [Render Blueprint](../render.yaml) is an optional single-container fallback. The [Cloud Run manifest](cloud-run.yaml) is legacy optional material, not an active prerequisite.

The tech lead's access discovery found the Vercel plugin unavailable under the current administrator policy, with no local authenticated CLI or linked project. The owner will handle Vercel login and deployment later. The prepared configuration remains ready for their selected team/project; no further login request is pending. Do not bypass the administrator policy or print access tokens.
The actual Tiger Data database already contains **18 application tables and three recorded migrations**, including pgvector and query leases; see [schema inventory](../docs/implementation/evidence/tiger-schema-inventory.json). Real Firebase/Admin sessions, Tiger persistence and Gemini were verified through the locally running application in [live-provider-check.json](../docs/implementation/evidence/live-provider-check.json). This is not evidence of a public deployment or recovery-email delivery.

## Preferred Vercel deployment

1. Import this repository as **one Next.js project**, or link it through the owner-authorized CLI/connector. Select Node 22 in project settings and repository root as the root directory. The base configuration uses `npm ci`, `npm run build` and region `iad1`; verify that region against the existing Tiger database location before deployment. Use the Next.js preset; do not configure a static export, separate backend project or Docker entrypoint. [Vercel Next.js integration](https://vercel.com/docs/frameworks/full-stack/nextjs)
2. Enter the environment inventory below through Vercel's private settings, scoped to the intended environment. Use `FIREBASE_SERVICE_ACCOUNT_JSON` rather than a local credential path. The four public Firebase values must be present before the build. Keep `.env` files and administrative JSON out of uploaded source. `APP_ORIGIN` must match the actual stable deployment URL; never derive trust from an arbitrary request Host. Use separately configured preview environments only when intentionally testing them. [Vercel environment configuration](https://vercel.com/docs/environment-variables)
3. Set `DATABASE_URL` to the existing Tiger connection string and `DATABASE_SSL=require`. Start with `DB_POOL_MAX=2` for managed-function deployment, monitor total database connections, and account for multiple function instances. The application lazily creates a process-local Postgres pool with a 20-second idle timeout. A per-instance pool limit is not a project-wide connection cap; verify concurrency and any approved Tiger pooling endpoint before increasing traffic. All durable data and leases reside in Tiger, so function lifecycle does not erase history or jobs.
4. Run migrations from the trusted operator checkout before a schema-dependent release; the existing database already has migrations 001–003. Do not run migrations during every function invocation or provision a replacement database. Set final HTTPS origin, Firebase authorized domains, real recovery-link configuration and separate Maps key restrictions before acceptance.
5. Keep the Node runtime for API routes: Firebase Admin and PostgreSQL require it. The indexing handler declares `maxDuration = 120`; verify the selected project's actual function-duration settings support it. A drain awaits up to four 12-second Gemini calls plus database work. The profile post-commit path awaits at most one targeted job. These requests do not rely on unawaited background execution. [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration)
6. Deploy the reviewed release after access is available, inspect build/function logs without credentials, verify `/api/health`, and execute the acceptance section below on its real HTTPS URL. The base configuration deliberately contains no cron schedule until the owner's scheduling plan is selected.

### Vercel indexing schedule

Native Vercel cron invokes an HTTP **GET** on the production deployment. The application's GET adapter authenticates only `CRON_SECRET`; supply at least 32 random characters. Vercel sends it as a bearer authorization header. External scheduler **POST** calls continue to use the separate `INDEXING_JOB_SECRET`. Neither cookie authentication nor a claimed cron user-agent authorizes the machine endpoint. [Cron invocation](https://vercel.com/docs/cron-jobs), [cron authentication](https://vercel.com/docs/cron-jobs/manage-cron-jobs)

Vercel Hobby permits only daily cron; Pro/Enterprise permit once per minute. Daily scheduling is insufficient for this application's intended timely indexing recovery. With an already authorized suitable plan, merge [vercel-cron.example.json](vercel-cron.example.json) into the root config to enable the minute schedule. This example is inactive until copied/deployed and does not authorize a paid upgrade. Otherwise use an owner-approved external scheduler to POST once per minute to the same project's endpoint. [Cron plan limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)

Vercel does not automatically retry a failed cron invocation. Subsequent scheduled drains retry eligible durable jobs using their persisted backoff; overlapping invocations are safe because jobs use database leases and token checks. Monitor scheduling failures and expired leases. Confirm that deployment protection allows the actual authorized scheduling mechanism; never expose a bypass token in source or URL logs. Native cron and external scheduler operation remain unverified until exercised on the deployed project. [Cron failure and concurrency behavior](https://vercel.com/docs/cron-jobs/manage-cron-jobs)

## Optional Render setup

1. Connect the repository and selected release branch to an owner-controlled Render workspace, then review the root Blueprint before importing it. It uses `runtime: docker`, `dockerfilePath: ./deployment/Dockerfile`, `dockerContext: .`, a Virginia region and `/api/health`. Automatic deployments are off. No Render database, separate backend, worker or cron service is declared. These fields follow the [official Blueprint reference](https://render.com/docs/blueprint-spec).
2. The explicit `plan: free` is a preview default, not a production availability promise. Free services sleep after 15 idle minutes and have usage/resource limits; external database/API traffic can also cause suspension. Choose an appropriate production compute plan only with the owner's authorization. Inspect workspace usage/spend settings before importing; free compute does not make external providers free. [Render free-service limitations](https://render.com/docs/free)
3. Enter the prompted environment values privately. `sync: false` prompts at initial creation; later secret additions must be entered through the service's environment editor. The two `generateValue` entries generate random 256-bit secrets. [Blueprint environment settings](https://render.com/docs/blueprint-spec#environment-variables)
4. Use the existing Tiger connection string as `DATABASE_URL`, with `DATABASE_SSL=require`; keep `DB_POOL_MAX=5`. Confirm any database network allowlist permits the chosen service's outbound addresses. Do not create a replacement database or reset the supplied schema.
5. Set `APP_ORIGIN` to the actual assigned HTTPS origin without a trailing slash. Add its hostname to Firebase Authentication's authorized domains. Use the same Firebase project for server and public client configuration, and verify email/password login and recovery links. Never deploy either Firebase emulator environment variable.
6. Set the server-only `FIREBASE_SERVICE_ACCOUNT_JSON` environment value to the complete JSON credential using Render's private editor. Do not commit the file or use a public-prefixed variable. This runbook uses an environment value rather than a secret-file mount; the non-root image does not assume a mounted credential path. Leave `GOOGLE_APPLICATION_CREDENTIALS` unset unless intentionally configuring and verifying a readable runtime mount.
7. Render exposes service environment variables as Docker build arguments and at runtime. Our Dockerfile consumes **only four public Firebase arguments**. It never declares or references database, Gemini or Firebase Admin secrets as build arguments, and `.dockerignore` excludes local credential files. Public Firebase changes require a new build. Google Maps browser configuration is fetched at runtime. [Render Docker environment handling](https://render.com/docs/docker#environment-variable-translation)
8. Run pending migrations from a trusted operator checkout before deploying a schema-dependent release, as described below. The minimal standalone image deliberately lacks the migration CLI and source scripts; do not configure a migration pre-deploy command against that image. Deploy the reviewed release, verify health and actual authentication, then configure the authenticated scheduling call below.

## Environment inventory

| Purpose | Variables | Handling |
| --- | --- | --- |
| Public origin | `APP_ORIGIN` | Exact deployed HTTPS origin; same origin for UI and APIs |
| Existing database | `DATABASE_URL`, `DATABASE_SSL`, `DB_POOL_MAX` | Private URL; TLS `require`; recommend pool 2 for Vercel, Render Blueprint uses 5 |
| Firebase Admin | `FIREBASE_PROJECT_ID`, `FIREBASE_SERVICE_ACCOUNT_JSON` | Server runtime only; use the owner-provided project credential |
| Firebase browser | `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`, `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID` | Intentionally public; consumed during the Next.js build |
| Gemini | `GEMINI_API_KEY`, `GEMINI_DAILY_CALL_LIMIT` | Private runtime key; optional legacy alias `GOOGLE_API_KEY`; default daily cap 500 |
| Durable indexing | `INDEXING_JOB_SECRET`, `CRON_SECRET` | Separate private secrets, each 32+ random characters; POST uses the first, native Vercel GET uses the second. Render generates the POST secret only |
| Office feature gates | `GOOGLE_MAPS_ENABLED`, `GOOGLE_MAPS_DEMO_MODE` | Default both false. Explicit demo mode permits the owner demo key for supported browser/Places prototype use |
| Google browser map | `NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY`, `NEXT_PUBLIC_GOOGLE_MAP_ID` (prototype alias: `REACT_APP_GOOGLE_MAPS_DEMO_KEY`) | Add separately after project review; browser key restricted to Maps JavaScript API and approved HTTPS referrers |
| Places service | `GOOGLE_PLACES_SERVER_KEY`, `OFFICE_PAGE_TOKEN_SECRET`, `OFFICE_DAILY_CALL_LIMIT` | Separate server-only Places API (New) key; token secret generated by Render or privately supplied on Vercel; default daily cap 500 |
| Portable server runtime | `NODE_ENV`, `HOSTNAME`, `PORT` | Docker/Node host: `production`, `0.0.0.0`, service port; Render uses 10000. Vercel manages the server runtime/port |

Optional Maps keys are intentionally not initial Render Blueprint prompts. Add them through the selected host’s environment editor when available, verify applicable Google account/region terms, public `/terms` and `/privacy`, attributions, enabled APIs, provider quotas and key restrictions, then set `GOOGLE_MAPS_ENABLED=true`. Never reuse the Gemini or Firebase browser API key for Maps. The owner-authorized prototype can instead explicitly set `GOOGLE_MAPS_DEMO_MODE=true` with `REACT_APP_GOOGLE_MAPS_DEMO_KEY`; Google supports Maps JavaScript and Places API (New) for this limited demo. The UI labels that mode. Before community launch, disable demo mode and use separate restricted production keys. If enforcing an IP restriction on the Places server key, use verified stable outbound addresses supported by the selected host. The app's global DB counters supplement provider-enforced quotas; they do not replace them. No Places result content is stored in the database.

## External scheduled recovery on the same application

Use an owner-approved scheduler to send an authenticated **POST once per minute** to `https://ACTUAL_HOST/api/jobs/embeddings`, with the private header `Authorization: Bearer <INDEXING_JOB_SECRET>`. Keep this header out of logs and repository files. The scheduler is a trigger for the existing web service, not a separate backend application. A scheduler/provider has not been provisioned or verified.

Allow a 120-second request deadline for four awaited jobs and possible startup delay; retry unsuccessful calls with bounded backoff. Each Gemini call has a 12-second timeout. Interrupted job leases recover after 60 seconds and query leases after 45 seconds. No background execution depends on CPU after the HTTP response. The route requires the bearer secret; OIDC by itself does not satisfy it. Profile saves also attempt one targeted job after commit, but scheduled recovery is still required for eventual retry after interruption or provider failure. A sleeping/suspended free instance cannot guarantee timely recovery; verify the selected hosting plan and scheduler together.

## Portable Docker or Node host

The same repository can run on another host supporting a long-lived Node 22 server or its Docker image, HTTPS, environment secrets and outbound provider connections. No frontend/backend split is needed. A tool-only GPT app integration does not by itself supply this Next.js hosting runtime.

For a local container build, export the four public Firebase values in the operator shell, then run:

```sh
docker build -f deployment/Dockerfile -t diverse-dmv:review \
  --build-arg NEXT_PUBLIC_FIREBASE_API_KEY \
  --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN \
  --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID \
  --build-arg NEXT_PUBLIC_FIREBASE_APP_ID .
docker run --rm --env-file .env.runtime -e HOSTNAME=0.0.0.0 -e PORT=8080 -p 8080:8080 diverse-dmv:review
```

`.env.runtime` is an untracked operator-created Docker-format environment file; credential JSON must occupy one line. For a local container test set `APP_ORIGIN=http://localhost:8080`; production requires its actual HTTPS origin. Server secrets are supplied at runtime only. On a native Node host, install with `npm ci`, build with `npm run build`, then run `npm start -- --hostname 0.0.0.0 --port "$PORT"` with the host's port and runtime environment. Set the public Firebase configuration before building.

## Migrations and operator checks

With Node 22 and an untracked environment file containing `DATABASE_URL` and provider configuration, run from the repository root:

```sh
npm ci
node --env-file=.env.runtime --conditions=react-server --import tsx scripts/migrate.ts
node --env-file=.env.runtime --conditions=react-server --import tsx scripts/check-providers.ts
```

Migrations are checksummed and additive. The supplied Tiger database is already migrated; rerunning the runner verifies recorded migrations rather than recreating tables. Preserve existing data and take a backup before new schema changes. Do not paste connection strings into command arguments or reports.

Demo seeding is optional and requires `ALLOW_FICTIONAL_SEED=true` plus `DEMO_ACCOUNT_PASSWORD` of at least 12 characters. Run `scripts/seed.ts` through the same Node command pattern only against the intended demo database/project. Existing fixture edits and conversations are preserved, and embeddings come from real Gemini calls. `--local-database-only` deliberately skips Firebase provisioning and cannot establish working login. Never enable live-test mutation flags against an unrelated production dataset.

## Deployment acceptance still required

Record release commit/image digest, hosting service/revision, region, actual HTTPS URL, UTC time and reproducible evidence. Verify health, two fictional connected accounts and an unrelated third account, publication/index recovery, changed-intent retrieval, privacy denial, retry/history after login, removal/reconnection/blocking, and actual password recovery. Repeat the PRD walkthrough and all 49 UX checks on the deployed URL, including the separate real Google office map on mobile, keyboard and assistive technology.

If retaining the specified GoDaddy domain requirement, the owner must provide or authorize that domain; configure DNS using the actual host's instructions, verify TLS/apex/WWW behavior, then update `APP_ORIGIN`, Firebase authorized domains/recovery configuration and Maps referrers together. No domain or hostname is invented here. Verify the scheduling call and lease recovery against the deployed service. A local image build, prepared Blueprint or schema inventory does not establish successful hosting.

The owner-supplied demo browser key passed a real isolated map/advanced-marker probe; see [evidence](../docs/implementation/evidence/maps-browser-probe.json). The canonical browser variable takes precedence over the alias. A subsequent owner-authorized bounded Places call also passed in explicit demo mode; see [Places evidence](../docs/implementation/evidence/maps-places-probe.json). These checks do not validate production referrer restrictions. Optimized local/hosted prototype builds may use the explicit flag; community launch must disable it and supply separate restricted keys. Google demo credentials are intended for prototyping. [Demo-key guidance](https://developers.google.com/maps/documentation/javascript/demo-key)
