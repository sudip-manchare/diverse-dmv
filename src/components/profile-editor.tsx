"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, mutation, useResource } from "@/lib/client-api";
import {
  characterCount,
  INTENTIONS,
  INTENTION_LABELS,
  FISH_VARIANTS,
  profileSchema,
  publishSchema,
  type ProfileData,
  type OwnProfile,
  type ProfileProjection,
} from "@/shared/contracts";
import { PageTitle, Notice, ErrorPanel, Modal, Fish } from "./ui";
import { ProfileContent } from "./profile-view";
import { useMember } from "./app-shell";
import { profileDrafts } from "@/lib/client-drafts";
const publicationCopy =
  "Publishing makes your selected profile details visible to signed-in community members. Your email and phone stay private. Seeking opportunities and identity details follow the audience you choose. Member-visible professional text is sent to Google Gemini to create numerical representations for matching people. Private and connection-only fields, identity details, email, phone and messages are excluded. You can edit or omit optional text, or keep your profile as a draft. Your profile may be viewable before it is ready to appear in discovery.";
export default function ProfileEditor({ setup = false }: { setup?: boolean }) {
  const router = useRouter();
  const member = useMember();
  const resource = useResource<{
    profile: OwnProfile;
    previews: { member: ProfileProjection; connection: ProfileProjection };
  }>("/api/me/profile");
  const [form, setForm] = useState<ProfileData | null>(null),
    [saved, setSaved] = useState<OwnProfile | null>(null),
    [skills, setSkills] = useState(""),
    [busy, setBusy] = useState(false),
    [status, setStatus] = useState(""),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [preview, setPreview] = useState(false),
    [audience, setAudience] = useState<"member" | "connection">("member"),
    [leave, setLeave] = useState<string | null>(null),
    [recoverDraft, setRecoverDraft] = useState<ProfileData | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const dirty =
    !!form && !!saved && JSON.stringify(form) !== JSON.stringify(saved.data);
  useEffect(() => {
    if (resource.data && !form) {
      setRecoverDraft(profileDrafts.get(member.account.id) || null);
      setForm(resource.data.profile.data);
      setSaved(resource.data.profile);
      setSkills(resource.data.profile.data.skills.join(", "));
      if (new URLSearchParams(window.location.search).get("preview"))
        setPreview(true);
    }
  }, [resource.data, form]);
  useEffect(() => {
    if (Object.keys(errors).length) errorRef.current?.focus();
  }, [errors]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    const link = (e: MouseEvent) => {
      const a = (e.target as HTMLElement).closest("a");
      if (
        a &&
        a.origin === location.origin &&
        !a.hash &&
        !e.ctrlKey &&
        !e.metaKey
      ) {
        e.preventDefault();
        setLeave(a.pathname + a.search);
      }
    };
    window.addEventListener("beforeunload", unload);
    document.addEventListener("click", link, true);
    return () => {
      window.removeEventListener("beforeunload", unload);
      document.removeEventListener("click", link, true);
    };
  }, [dirty]);
  useEffect(() => {
    if (dirty && form) profileDrafts.set(member.account.id, form);
  }, [dirty, form, member.account.id]);
  function update<K extends keyof ProfileData>(key: K, value: ProfileData[K]) {
    setForm((p) => (p ? { ...p, [key]: value } : p));
    setStatus("");
    setErrors((e) => {
      const n = { ...e };
      delete n[key];
      return n;
    });
  }
  function validate(publish = false) {
    if (!form) return false;
    const parsed = (publish ? publishSchema : profileSchema).safeParse(form);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((x) => [x.path.join("."), x.message]),
        ),
      );
      setPreview(false);
      return false;
    }
    return true;
  }
  async function save(andPreview = false) {
    if (!form || !saved || !validate()) return;
    setBusy(true);
    setErrors({});
    setStatus("");
    try {
      const res = await mutation(
        "/api/me/profile",
        {
          version: saved.version,
          cosmeticVersion: saved.cosmeticVersion,
          data: form,
        },
        "PATCH",
      );
      const next = res.profile as OwnProfile;
      profileDrafts.delete(member.account.id);
      setSaved(next);
      setForm(next.data);
      setSkills(next.data.skills.join(", "));
      await resource.reload();
      member.refresh();
      setStatus(
        next.version === saved.version &&
          next.cosmeticVersion !== saved.cosmeticVersion
          ? "Fish companion updated."
          : next.published
            ? "Changes saved. Your profile is being updated for discovery."
            : "Changes saved.",
      );
      if (andPreview) {
        setPreview(true);
        document.querySelector<HTMLElement>("h1")?.focus();
      }
    } catch (e: any) {
      setErrors(
        e.fields || {
          form:
            e.code === "STALE_STATE"
              ? "Your information changed elsewhere. Review the latest version before saving."
              : "We couldn’t confirm whether your changes were saved. Your entries are still here. Refresh to check.",
        },
      );
    } finally {
      setBusy(false);
    }
  }
  async function publish() {
    if (!saved || !validate(true)) return;
    setBusy(true);
    try {
      await mutation("/api/me/profile/publish", { version: saved.version });
      member.refresh();
      router.push("/profile");
    } catch (e: any) {
      setErrors(
        e.fields || {
          form: "We couldn’t confirm publication. Refresh to check your profile’s status.",
        },
      );
    } finally {
      setBusy(false);
    }
  }
  function field(
    key: keyof ProfileData,
    label: string,
    long = false,
    help?: string,
    required = false,
  ) {
    if (!form) return null;
    const err = errors[key];
    const props = {
      id: key,
      value: String(form[key] || ""),
      onChange: (
        e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
      ) => update(key, e.target.value as never),
      "aria-invalid": !!err,
      "aria-describedby": `${key}-help${err ? ` ${key}-error` : ""}`,
    };
    return (
      <div className="field" key={key}>
        <label htmlFor={key}>
          {label}
          {required ? "" : " (optional)"}
        </label>
        {long ? (
          <textarea {...props} rows={3} />
        ) : (
          <input {...props} type={key.endsWith("Url") ? "url" : "text"} />
        )}
        <p id={`${key}-help`} className="help">
          {help || "Shared with members after publication."}
          {["hereFor", "lookingToConnectWith"].includes(key) &&
            ` ${characterCount(String(form[key]))}/500 characters.`}
        </p>
        {err && (
          <p id={`${key}-error`} className="field-error">
            {err}
          </p>
        )}
      </div>
    );
  }
  function scope(key: keyof ProfileData, label: string) {
    return (
      <div className="field">
        <label htmlFor={key}>{label}</label>
        <select
          id={key}
          value={String(form?.[key])}
          onChange={(e) => update(key, e.target.value as never)}
        >
          <option value="private">Only me</option>
          <option value="connections">Connections</option>
          <option value="members">Members</option>
        </select>
      </div>
    );
  }
  function details(title: string, children: React.ReactNode) {
    return (
      <details>
        <summary>{title}</summary>
        <div>{children}</div>
      </details>
    );
  }
  if (resource.error)
    return (
      <>
        <PageTitle title="Edit profile" />
        <ErrorPanel error={resource.error} retry={resource.reload} />
      </>
    );
  if (!form || !saved) return <Notice title="Loading your information…" />;
  return (
    <>
      <PageTitle
        title={
          preview
            ? "Preview your profile"
            : setup
              ? "Set up your profile"
              : "Edit profile"
        }
        eyebrow="Your story. Your choice."
      >
        <p>
          {saved.published
            ? "Your published profile is visible to eligible community members."
            : "Draft · Only you can see this profile."}
        </p>
      </PageTitle>
      <div className="panel editor">
        {recoverDraft && (
          <Notice title="Unsaved changes are available in this tab.">
            <p>
              Your latest saved profile has been loaded. Restore your earlier
              edits only after reviewing the current version.
            </p>
            <div className="actions">
              <button
                onClick={() => {
                  setForm(recoverDraft);
                  setSkills(recoverDraft.skills.join(", "));
                  setRecoverDraft(null);
                }}
              >
                Restore unsaved changes
              </button>
              <button
                className="secondary"
                onClick={() => {
                  profileDrafts.delete(member.account.id);
                  setRecoverDraft(null);
                }}
              >
                Discard
              </button>
            </div>
          </Notice>
        )}
        {Object.keys(errors).length > 0 && (
          <div ref={errorRef} tabIndex={-1}>
            <Notice error title="Check the highlighted fields.">
              <ul>
                {Object.entries(errors).map(([key, value]) => (
                  <li key={key}>
                    {key === "form" ? (
                      value
                    ) : (
                      <a
                        href={`#${key}`}
                        onClick={() => {
                          setPreview(false);
                          setTimeout(() => {
                            const element = document.getElementById(key);
                            element
                              ?.closest("details")
                              ?.setAttribute("open", "");
                            element?.focus();
                          }, 30);
                        }}
                      >
                        {value}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
              {errors.form && (
                <button
                  className="secondary"
                  onClick={async () => {
                    const next = await api<any>("/api/me/profile");
                    setSaved(next.profile);
                    setStatus(
                      "Latest version loaded. Your unsaved values remain for comparison. Review before saving.",
                    );
                  }}
                >
                  Review latest version
                </button>
              )}
            </Notice>
          </div>
        )}
        {status && <Notice title={status} />}{" "}
        {preview ? (
          <>
            <Notice
              title={
                saved.published
                  ? "Preview of your saved profile"
                  : "Preview only — your profile hasn’t been published."
              }
            />
            <div className="field">
              <label htmlFor="audience">View as</label>
              <select
                id="audience"
                value={audience}
                onChange={(e) =>
                  setAudience(e.target.value as "member" | "connection")
                }
              >
                <option value="member">Member</option>
                <option value="connection">Connection</option>
              </select>
              <p role="status" className="help">
                {audience === "member"
                  ? "Member preview"
                  : "Connection preview"}
              </p>
            </div>
            {resource.data?.previews && (
              <ProfileContent data={resource.data.previews[audience]} />
            )}
            <div className="disclosure">
              <p>{publicationCopy}</p>
              <p>
                Members can read this text. Avoid adding private job-search or
                identity details you don’t want members to see.
              </p>
              <p>
                Review the Member and Connection previews before publishing.
              </p>
              <button className="text-button" onClick={() => setPreview(false)}>
                Edit your visibility
              </button>
            </div>
            <div className="actions">
              <button className="secondary" onClick={() => setPreview(false)}>
                Back to editing
              </button>
              {!saved.published ? (
                <>
                  <Link href="/dashboard">Keep as draft</Link>
                  <button disabled={busy} onClick={publish}>
                    {busy ? "Publishing…" : "Publish profile"}
                  </button>
                </>
              ) : (
                <Link className="button" href="/profile">
                  Back to My profile
                </Link>
              )}
            </div>
          </>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            noValidate
          >
            {dirty && (
              <p className="help" role="status">
                Unsaved changes
              </p>
            )}
            {field(
              "displayName",
              "Display name",
              false,
              "Your name in the community.",
              true,
            )}
            <fieldset id="intentions">
              <legend>Intentions</legend>
              <p className="help">
                Choose all that fit. You can change these anytime.
              </p>
              <div className="checkbox-options">
                {INTENTIONS.map((i) => (
                  <label className="checkbox-label" key={i}>
                    <input
                      type="checkbox"
                      checked={form.intentions.includes(i)}
                      onChange={(e) =>
                        update(
                          "intentions",
                          e.target.checked
                            ? [...form.intentions, i]
                            : form.intentions.filter((v) => v !== i),
                        )
                      }
                    />
                    {INTENTION_LABELS[i]}
                  </label>
                ))}
              </div>
              {errors.intentions && (
                <p className="field-error">{errors.intentions}</p>
              )}
            </fieldset>
            {field(
              "hereFor",
              "Here for",
              true,
              "What would you like to achieve, learn, find or offer? Members can read this text. Avoid adding private job-search or identity details you don’t want members to see.",
              true,
            )}
            {field(
              "lookingToConnectWith",
              "Looking to connect with",
              true,
              "What people, experience or help would you like to find?",
              true,
            )}
            <div className="field">
              <label htmlFor="skills">Skills or interests</label>
              <input
                id="skills"
                value={skills}
                aria-invalid={!!errors.skills}
                onChange={(e) => {
                  setSkills(e.target.value);
                  update(
                    "skills",
                    Array.from(
                      new Map(
                        e.target.value
                          .split(",")
                          .map((x) => x.trim())
                          .filter(Boolean)
                          .map((x) => [x.toLowerCase(), x]),
                      ).values(),
                    ),
                  );
                }}
              />
              <p className="help">
                Separate with commas. Learning interests count. You don’t need
                to be an expert. Up to 20, each 50 characters.
              </p>
              {errors.skills && <p className="field-error">{errors.skills}</p>}
            </div>
            <div className="disclosure">
              <strong>Your visibility</strong>
              <p>
                Required professional text is shared with members after you
                publish. Your email and phone always stay private.
              </p>
              {scope(
                "seekingVisibility",
                "Who can see that you’re seeking opportunities?",
              )}
              <p className="help">Private details aren’t used for matching.</p>
            </div>
            {details(
              "Introduction",
              <>
                {field("headline", "Headline")}
                {field("bio", "Bio", true)}
                {field("lookingFor", "Looking for", true)}
                {field("happyToHelp", "Happy to help with", true)}
                {field(
                  "imageUrl",
                  "Profile image URL",
                  false,
                  "A photo is optional. Use an HTTPS image link; your initials appear if it cannot load.",
                )}
                <p className="help">
                  A photo is optional. Your initials identify you without an
                  image.
                </p>
              </>,
            )}
            {details(
              "Background",
              <>
                {field(
                  "experienceLevel",
                  "Experience level",
                  false,
                  "Beginner and career changer are welcome.",
                )}
                {field("employer", "Employer")}
                {field("organization", "Organization")}
                {field("education", "Education", true)}
                {field("university", "University affiliation")}
              </>,
            )}
            {details(
              "Location and work",
              <>
                {field(
                  "location",
                  "Broad location",
                  false,
                  "City or broad region only. Don’t add your address or live location.",
                )}
                <fieldset>
                  <legend>Work preferences (optional)</legend>
                  {(["remote", "hybrid", "in_person"] as const).map((v) => (
                    <label className="checkbox-label" key={v}>
                      <input
                        type="checkbox"
                        checked={form.workPreferences.includes(v)}
                        onChange={(e) =>
                          update(
                            "workPreferences",
                            e.target.checked
                              ? [...form.workPreferences, v]
                              : form.workPreferences.filter((x) => x !== v),
                          )
                        }
                      />
                      {
                        {
                          remote: "Remote",
                          hybrid: "Hybrid",
                          in_person: "In person",
                        }[v]
                      }
                    </label>
                  ))}
                </fieldset>
              </>,
            )}
            {details(
              "Work samples and links",
              <>
                <p className="help">
                  School, personal and community projects all count. Links open
                  an external site. We never import their contents.
                </p>
                {form.projects.map((project, i) => (
                  <fieldset key={i}>
                    <legend>Project {i + 1}</legend>
                    {(["title", "description", "url"] as const).map((k) => (
                      <div className="field" key={k}>
                        <label htmlFor={`project-${i}-${k}`}>
                          {k === "url"
                            ? "Work link"
                            : k === "title"
                              ? "Project title"
                              : "Project description"}{" "}
                          (optional)
                        </label>
                        <input
                          id={`project-${i}-${k}`}
                          value={project[k]}
                          onChange={(e) =>
                            update(
                              "projects",
                              form.projects.map((p, n) =>
                                n === i ? { ...p, [k]: e.target.value } : p,
                              ),
                            )
                          }
                        />
                      </div>
                    ))}
                    <button
                      type="button"
                      className="text-button danger"
                      onClick={() =>
                        update(
                          "projects",
                          form.projects.filter((_, n) => n !== i),
                        )
                      }
                    >
                      Remove project {i + 1}
                    </button>
                  </fieldset>
                ))}
                {form.projects.length < 5 && (
                  <button
                    type="button"
                    className="secondary"
                    onClick={() =>
                      update("projects", [
                        ...form.projects,
                        { title: "", description: "", url: "" },
                      ])
                    }
                  >
                    Add a project
                  </button>
                )}
                <div style={{ marginTop: "1.5rem" }}>
                  {field("portfolioUrl", "Portfolio URL")}
                  {field("githubUrl", "GitHub URL")}
                  {field(
                    "linkedinUrl",
                    "LinkedIn profile URL",
                    false,
                    "A link only. We don’t import your LinkedIn information.",
                  )}
                  {field(
                    "resumeUrl",
                    "Résumé link",
                    false,
                    "A résumé link is enough; uploads aren’t available.",
                  )}
                </div>
              </>,
            )}
            {details(
              "Seeking opportunities",
              <>
                {field("desiredRoles", "Desired roles", true)}
                {field("opportunityTypes", "Opportunity types", true)}
                {field("careerInterests", "Career interests", true)}
                {field("nextStep", "Next-step summary", true)}
                <p className="help">
                  These details follow your Seeking opportunities audience.
                </p>
              </>,
            )}
            {details(
              "Hiring",
              <>
                <p className="help">
                  Hiring information is self-reported. The community hasn’t
                  verified this organization or opportunity.
                </p>
                {field("hiringOrganization", "Hiring organization")}
                {field("hiringRelationship", "Relationship to it")}
                {field("opportunitySummary", "Opportunity summary", true)}
              </>,
            )}
            {details(
              "Mentoring",
              <>
                {field("mentoringTopics", "Help topics", true)}
                {field("mentoringAudience", "Intended audience", true)}
                {field("mentoringInteraction", "Preferred interaction", true)}
                <div className="field">
                  <label htmlFor="availability">Mentoring availability</label>
                  <select
                    id="availability"
                    value={form.mentoringAvailability}
                    onChange={(e) =>
                      update(
                        "mentoringAvailability",
                        e.target.value as "paused" | "accepting",
                      )
                    }
                  >
                    <option value="paused">Paused</option>
                    <option value="accepting">Accepting requests</option>
                  </select>
                  <p className="help">
                    Accepting requests doesn’t commit you to every request.
                    Pause anytime.
                  </p>
                </div>
              </>,
            )}
            {details(
              "Networking / exploring",
              <>
                {field("learningGoals", "Learning goals", true)}
                {field("networkingInterests", "Interests", true)}
                {field("collaborationIdeas", "Collaboration ideas", true)}
                {field("discussionTopics", "Discussion topics", true)}
              </>,
            )}
            {details(
              "Identity",
              <>
                <p className="help">
                  Share only if you want to. We won’t infer your identity. These
                  fields are excluded from matching.
                </p>
                {field("pronouns", "Pronouns")}
                {scope("pronounsVisibility", "Pronouns audience")}
                {field("identity", "Self-described identity", true)}
                {scope("identityVisibility", "Identity audience")}
                {field("affiliations", "Community affiliations", true)}
                {scope("affiliationsVisibility", "Affiliations audience")}
              </>,
            )}
            {details(
              "Appearance",
              <fieldset>
                <legend>Your fish companion</legend>
                <p className="help">
                  Choose a fish, or keep the default. This doesn’t affect
                  matching.
                </p>
                <div className="fish-options">
                  {FISH_VARIANTS.map((f) => (
                    <label className="fish-option" key={f}>
                      <input
                        type="radio"
                        name="fish"
                        value={f}
                        checked={form.fish === f}
                        onChange={() => update("fish", f)}
                      />
                      <Fish variant={f} />
                      <span>
                        {
                          {
                            teal: "Rose stripes",
                            sunlight: "Blush stripes",
                            coral: "Raspberry stripes",
                            indigo: "Mulberry stripes",
                          }[f]
                        }
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>,
            )}
            <p className="help">
              Name: 100 characters. Headline and short fields: 160. Other prose:
              1,000. HTTPS links: 2,048. Characters count Unicode code points;
              your text is never truncated.
            </p>
            <div className="actions">
              <button type="submit" disabled={busy}>
                {busy ? "Saving…" : "Save changes"}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => (dirty ? void save(true) : setPreview(true))}
              >
                {dirty ? "Save and preview" : "Preview profile"}
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  dirty ? setLeave("/profile") : router.push("/profile")
                }
              >
                Cancel changes
              </button>
            </div>
          </form>
        )}
      </div>
      {leave && (
        <Modal title="Leave without saving?" onClose={() => setLeave(null)}>
          <p>Your unsaved changes will be lost.</p>
          <div className="actions">
            <button
              className="secondary"
              data-autofocus
              onClick={() => setLeave(null)}
            >
              Keep editing
            </button>
            <button
              className="danger"
              onClick={() => {
                const target = leave;
                setLeave(null);
                profileDrafts.delete(member.account.id);
                setForm(saved.data);
                router.push(target);
              }}
            >
              Leave without saving
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
