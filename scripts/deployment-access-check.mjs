/** Read-only GCP access preflight. Never prints credentials, tokens, key strings,
 * secret payloads, project IAM bindings or service environment variables.
 * GET + :testIamPermissions only; does not enable APIs or create resources.
 */
import { GoogleAuth } from "google-auth-library";
import { readFile, writeFile, mkdir } from "node:fs/promises";
const credentialPath =
  process.env.DEPLOYMENT_CREDENTIAL_FILE ||
  "diverse-dmv-firebase-adminsdk-fbsvc-d4adfb22b9.json";
const credentials = JSON.parse(await readFile(credentialPath, "utf8"));
const project = credentials.project_id;
if (project !== "diverse-dmv")
  throw new Error("Unexpected project; refusing to inspect another project.");
const auth = new GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/cloud-platform"],
});
const checks = [];
function errorMetadata(data) {
  return {
    status: data.error?.status ?? "UNKNOWN",
    details: (data.error?.details ?? [])
      .filter((d) => d["@type"]?.endsWith("ErrorInfo"))
      .map((d) => ({
        reason: d.reason,
        domain: d.domain,
        service: d.metadata?.service,
        permission: d.metadata?.permission,
      })),
  };
}
async function call(label, url, projector, body) {
  let stage = "token";
  try {
    const token = await auth.getAccessToken();
    stage = "request";
    const response = await fetch(url, {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    stage = "json";
    const data = await response.json();
    stage = "projection";
    const result = {
      check: label,
      http: response.status,
      ...(response.ok
        ? { status: "accessible", ...projector(data) }
        : { status: "unavailable", error: errorMetadata(data) }),
    };
    checks.push(result);
    return { ok: response.ok, data, result };
  } catch (error) {
    const safeCode = (value) =>
      typeof value === "string" && /^[A-Za-z0-9_.-]{1,90}$/.test(value)
        ? value
        : undefined;
    const result = {
      check: label,
      status: "unverified",
      error: "Authentication/network/read failed; sensitive error suppressed.",
      diagnostic: {
        stage,
        class: safeCode(error?.name),
        code: safeCode(error?.code),
        http: error?.response?.status,
        providerCode: safeCode(error?.response?.data?.error),
        causeCode: safeCode(error?.cause?.code),
      },
    };
    checks.push(result);
    return { ok: false, result };
  }
}
const permissions = [
  "resourcemanager.projects.get",
  "serviceusage.services.list",
  "serviceusage.services.get",
  "serviceusage.services.enable",
  "run.services.list",
  "run.services.get",
  "run.services.create",
  "run.services.update",
  "run.services.setIamPolicy",
  "artifactregistry.repositories.list",
  "artifactregistry.repositories.get",
  "artifactregistry.repositories.create",
  "artifactregistry.repositories.uploadArtifacts",
  "secretmanager.secrets.list",
  "secretmanager.secrets.get",
  "secretmanager.secrets.create",
  "secretmanager.versions.add",
  "secretmanager.versions.access",
  "cloudscheduler.jobs.list",
  "cloudscheduler.jobs.create",
  "cloudscheduler.jobs.update",
  "cloudbuild.builds.create",
  "cloudbuild.builds.get",
  "iam.serviceAccounts.actAs",
  "iam.serviceAccounts.list",
  "apikeys.keys.list",
];
const projectRead = await call(
  "project-metadata",
  `https://cloudresourcemanager.googleapis.com/v1/projects/${project}`,
  (d) => ({
    projectId: d.projectId,
    lifecycleState: d.lifecycleState,
    projectNumberPresent: !!d.projectNumber,
  }),
);
const parent = `projects/${projectRead.ok ? projectRead.data.projectNumber : project}`;
const services = [
  "run.googleapis.com",
  "artifactregistry.googleapis.com",
  "secretmanager.googleapis.com",
  "cloudscheduler.googleapis.com",
  "cloudbuild.googleapis.com",
  "maps-backend.googleapis.com",
  "places.googleapis.com",
  "apikeys.googleapis.com",
];
const independently = await Promise.allSettled([
  call(
    "project-permissions",
    `https://cloudresourcemanager.googleapis.com/v1/projects/${project}:testIamPermissions`,
    (d) => ({
      granted: d.permissions ?? [],
      notGrantedAtProject: permissions.filter(
        (p) => !(d.permissions ?? []).includes(p),
      ),
      scopeNote: "Project-level test; resource-specific grants can differ.",
    }),
    { permissions },
  ),
  call(
    "billing-enabled",
    `https://cloudbilling.googleapis.com/v1/projects/${project}/billingInfo`,
    (d) => ({
      billingEnabled: d.billingEnabled === true,
      hasBillingAccount: !!d.billingAccountName,
    }),
  ),
  call(
    "required-api-enablement",
    `https://serviceusage.googleapis.com/v1/${parent}/services?filter=state%3AENABLED&pageSize=200`,
    (d) => ({
      services: services.map((service) => ({
        service,
        state: (d.services ?? []).some((s) => s.config?.name === service)
          ? "ENABLED"
          : d.nextPageToken
            ? "UNKNOWN_MORE_PAGES"
            : "NOT_IN_ENABLED_LIST",
      })),
      morePages: !!d.nextPageToken,
    }),
  ),
  ...["us-east4", "us-east1"].map((region) =>
    call(
      `cloud-run-services-${region}`,
      `https://run.googleapis.com/v2/projects/${project}/locations/${region}/services?pageSize=100`,
      (d) => ({
        region,
        services: (d.services ?? []).map((s) => ({
          name: s.name,
          uri: s.uri,
          ready: s.terminalCondition?.state === "CONDITION_SUCCEEDED",
        })),
        morePages: !!d.nextPageToken,
      }),
    ),
  ),
  ...["us-east4", "us-east1", "us"].map((region) =>
    call(
      `artifact-repositories-${region}`,
      `https://artifactregistry.googleapis.com/v1/projects/${project}/locations/${region}/repositories?pageSize=100`,
      (d) => ({
        region,
        repositories: (d.repositories ?? []).map((r) => ({
          name: r.name,
          format: r.format,
          mode: r.mode,
        })),
        morePages: !!d.nextPageToken,
      }),
    ),
  ),
  call(
    "secret-metadata-only",
    `https://secretmanager.googleapis.com/v1/projects/${project}/secrets?pageSize=100`,
    (d) => ({
      secretCount: (d.secrets ?? []).length,
      morePages: !!d.nextPageToken,
      note: "No secret version or payload accessed; names omitted.",
    }),
  ),
  call(
    "scheduler-job-metadata",
    `https://cloudscheduler.googleapis.com/v1/projects/${project}/locations/us-east4/jobs?pageSize=100`,
    (d) => ({
      region: "us-east4",
      jobs: (d.jobs ?? []).map((j) => ({
        name: j.name,
        state: j.state,
        schedule: j.schedule,
      })),
      morePages: !!d.nextPageToken,
      note: "Job HTTP headers, bodies, credentials and URLs omitted.",
    }),
  ),
  call(
    "api-key-restrictions-metadata",
    `https://apikeys.googleapis.com/v2/${parent}/locations/global/keys?pageSize=100`,
    (d) => ({
      keys: (d.keys ?? []).map((k, index) => ({
        ordinal: index + 1,
        displayName: k.displayName ?? null,
        apiTargets: k.restrictions?.apiTargets ?? [],
        browserAllowedReferrers:
          k.restrictions?.browserKeyRestrictions?.allowedReferrers ?? [],
        serverAllowedIpCount:
          k.restrictions?.serverKeyRestrictions?.allowedIps?.length ?? 0,
        hasAndroidRestriction: !!k.restrictions?.androidKeyRestrictions,
        hasIosRestriction: !!k.restrictions?.iosKeyRestrictions,
        hasRestrictions: !!k.restrictions,
      })),
      morePages: !!d.nextPageToken,
      note: "Metadata only. No getKeyString request; no key reused or changed.",
    }),
  ),
]);
for (const result of independently)
  if (result.status === "rejected")
    checks.push({
      check: "parallel-read",
      status: "unverified",
      error: "Read failed; details suppressed.",
    });
const required = [
  "run.services.create",
  "run.services.update",
  "artifactregistry.repositories.uploadArtifacts",
  "secretmanager.secrets.create",
  "secretmanager.versions.add",
  "cloudscheduler.jobs.create",
  "iam.serviceAccounts.actAs",
];
const iam = checks.find((c) => c.check === "project-permissions");
const evidence = {
  recordedAt: new Date().toISOString(),
  projectId: project,
  credentialType: "Owner-supplied Firebase Admin service-account JSON",
  readOnly: true,
  mutationsPerformed: [],
  checks,
  conclusion: {
    requiredDeploymentPermissionsGranted: iam?.granted
      ? required.every((p) => iam.granted.includes(p))
      : null,
    missingAtProject: iam?.granted
      ? required.filter((p) => !iam.granted.includes(p))
      : [],
    billingEnabled:
      checks.find((c) => c.check === "billing-enabled")?.billingEnabled ?? null,
    existingReadyCloudRunTargets: checks
      .filter((c) => c.check.startsWith("cloud-run-services-"))
      .flatMap((c) =>
        (c.services ?? [])
          .filter((s) => s.ready)
          .map((s) => ({ name: s.name, uri: s.uri })),
      ),
    limitations: [
      "A denied metadata request does not prove the resource is absent.",
      "No billing enabled or paid resources created. No API enabled.",
      "A Firebase Admin credential does not by itself imply deployment privileges.",
      "No Google Maps key is inferred from or reused from Firebase/Gemini credentials.",
    ],
  },
};
await mkdir("docs/implementation/evidence", { recursive: true });
await writeFile(
  "docs/implementation/evidence/deployment-access.json",
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      recordedAt: evidence.recordedAt,
      checks: checks.map((c) => ({
        check: c.check,
        http: c.http,
        status: c.status,
        error: c.error,
      })),
      conclusion: evidence.conclusion,
    },
    null,
    2,
  ),
);
