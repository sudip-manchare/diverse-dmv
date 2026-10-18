# diverse-dmv

**A professional network celebrating and connecting underrepresented genders in tech across the Washington, D.C., Maryland, and Virginia (DMV) area.**

Discover people, showcase your work, and build career connections based on what you are looking for and what you can offer.

> Career support should continue beyond a conference. diverse-dmv helps people of underrepresented genders in tech connect with peers, hiring professionals, mentors, and collaborators throughout the year.

## Project status

**Direct Docker setup:** [Build and run the app](deployment/DOCKER.md) with the existing provider services using `docker compose --env-file .env.runtime up --build -d --wait`. This starts one app container and does not run migrations or create demo data.

The repository now contains one runnable Next.js application with real Firebase sessions, persisted profiles, mutual connections, messaging, live Gemini/Tiger Data vector retrieval, and a working Google Maps/Places office explorer using the owner's demo key. Start with [SETUP.md](SETUP.md), the [implementation report](IMPLEMENTATION_REPORT.md), and the [49-check acceptance record](docs/implementation/ACCEPTANCE.md).

The working MVP is **not yet complete**: the remaining Maps/accessibility checks, hosted deployment and production recovery email delivery require verification. The acceptance record is 39 passed and 10 unverified. Firebase Authentication/Admin sessions, Tiger Data persistence and Gemini now have live-provider evidence. PRD/architecture v0.2 and the six UX specifications govern where the earlier concept below differs. The owner subsequently replaced Cloud Run with Vercel as the preferred hosting target and will handle hosting access/deployment later. Frontend and backend remain one Next.js application. The implementation report distinguishes observed runtime results from outstanding scope.

## The problem

Career growth often depends on access to people: someone who shares an opportunity, answers an industry question, introduces a collaborator, or helps a beginner understand where to start.

For people of underrepresented genders in tech, finding a welcoming professional community can be an important part of that process. Existing professional profiles communicate credentials, but they do not always make it clear who welcomes a conversation, what someone needs right now, or how to approach them.

Conferences and hackathons can create valuable connections, but those relationships need somewhere to continue. The cancellation of Grace Hopper Celebration 2026 is a timely motivation for the project: career support should not depend on a single event taking place. The product's long-term purpose is broader than any one cancellation.

The initial community is the DMV region, where local students, professionals, universities, employers, and community groups can connect around shared interests and opportunities. Local discovery should use broad, voluntarily provided locations rather than precise whereabouts.

## The idea

diverse-dmv is a professional network where members create their own profiles, choose their current career intentions, discover relevant people, and send connection requests.

Its central organizing question is:

**What are you here to do, and what are you open to helping others with?**

Members can be seeking opportunities, hiring, mentoring, networking, or doing several of these at once. Their intentions shape the information on their profiles and the people they discover.

The network supports relationships between peers, students and alumni, job seekers and hiring professionals, experienced professionals and newcomers, and potential project collaborators. Mentorship is one possible relationship within the network, rather than the sole purpose of the product.

## Who it serves

- Students looking for internships, their first professional connections, or project partners.
- Early-career professionals seeking jobs, peers, and industry guidance.
- Experienced professionals interested in community, collaboration, and sharing knowledge.
- Career changers exploring a new field or returning to technology.
- Recruiters, founders, and hiring managers sharing opportunities and meeting interested candidates.
- Mentors offering help with specific topics.
- People still exploring technology who do not yet have a résumé, portfolio, or clear career goal.

The experience centers underrepresented genders in tech. Gender identity is self-described and optional; the product should not infer identity from names, photos, pronouns, or external profiles. Participation and access rules must be made explicit before a public launch. A LinkedIn account, employer, university affiliation, or prior experience should not be required to participate.

## Role-based participation

Roles describe a member's current intentions. They are editable, can overlap, and do not define a permanent identity or account type. A job seeker can also mentor beginners; a hiring manager can also be exploring their next role.

### Seeking opportunities

For members looking for internships, full-time positions, contract work, or other professional opportunities.

Optional profile details include:

- Target job titles and areas of interest.
- Opportunity types, such as internship or full-time employment.
- Skills and relevant projects.
- Experience level, including a beginner or career-changing background.
- Broad location and remote, hybrid, or in-person preferences.
- A short description of what they want to do next.
- Résumé, portfolio, GitHub, or LinkedIn links.

Discovery can surface hiring professionals with relevant openings, peers with similar interests, and professionals open to discussing the target field. Job-seeking visibility needs its own control because a member may not want their current employer or every visitor to see that status.

### Hiring

For members recruiting for a team, company, startup, or project.

Optional profile details include:

- Organization and their relationship to it.
- Roles or opportunities available.
- Required and preferred skills, clearly distinguished.
- Experience expectations and work arrangements.
- An application link and deadline, when applicable.
- Whether they welcome questions about the role.

The MVP can represent opportunities as structured information attached to a hiring member's profile, avoiding the need to build a complete job board. Hiring claims are self-reported unless a real verification process has been completed.

### Mentoring

For members willing to share knowledge or career guidance.

Optional profile details include:

- Topics they can help with, such as portfolio feedback, interviewing, career switching, or entering a particular field.
- The audience or experience levels they feel equipped to support.
- Preferred interaction, such as a short conversation or written feedback.
- Availability and whether they are currently accepting requests.

Being open to mentoring does not imply unlimited availability or a commitment to every request. Members should be able to pause this role or narrow the help they offer.

### Networking and exploring

For members who want to meet people, learn about technology, find collaborators, or participate without an immediate hiring or job-search goal.

Optional profile details include interests, learning goals, projects, collaboration ideas, and topics they would like to discuss. This role gives newcomers a useful starting point without requiring professional credentials.

## Core product experience

### 1. Join and set your intentions

A member creates an account, chooses one or more roles, and enters enough information to make discovery useful. Onboarding should be short and allow optional details to be added later.

The minimum useful profile could consist of a display name, one role, a few interests or skills, and a sentence about what the member wants to do next. The member previews their profile and understands its visibility before publishing it.

### 2. Build a professional profile

A profile combines professional information with a clear invitation to connect.

Suggested sections:

- Display name and optional profile image.
- Headline or short introduction.
- Current roles and career interests.
- Skills, learning interests, and broad experience level.
- Projects and work samples, including school, personal, and community work.
- Optional experience and education.
- “Looking for…” and “Happy to help with…” sections.
- Broad location and work preferences, when relevant.
- Optional pronouns and self-described community affiliations.
- External links and a connection action.

A useful profile should still be possible without a photograph, prestigious employer, formal education, or long work history. Project showcases can help members demonstrate what they are learning and building.

### 3. Discover relevant people

The discovery page shows member cards with enough context to decide whether to open a profile or send a request.

Each card can include a name, headline, role badges, a few relevant tags, and a short explanation of relevance. For example:

> Interested in frontend internships · React and accessibility · Open to meeting peers

> Hiring for an entry-level data role · Welcomes questions from applicants

Suggested filters include role, skill, industry or interest, opportunity type, broad location, and availability to help. Members should be able to browse beyond recommendations and change their filters.

### 4. Connect with context

A member sends a request with an optional short introduction explaining why they want to connect. The recipient can accept, decline, block, or report the request.

Example introductions:

> I'm also learning cybersecurity and saw your campus security project. I'd love to connect and hear how you approached it.

> I'm interested in the frontend internship on your profile. Would you be open to a question about the team's work?

Accepted requests create mutual connections. The sender should not see a request as accepted before the recipient acts, and repeated pending requests to the same person should be prevented.

### 5. Grow your network

A network page shows accepted connections and incoming or outgoing requests. Members can revisit profiles and remove connections.

Full messaging can follow once discovery and connection management work reliably. For the MVP, an accepted connection can unlock a separately consented contact method. Acceptance should not automatically expose private email addresses or other undisclosed contact details.

## Discovery and relevance

Recommendations should help members find plausible people to talk to, with clear reasons rather than opaque compatibility scores.

Potential signals include:

- Compatible intentions, such as a member seeking an internship and another hiring interns.
- Shared skills or interests.
- Relevant opportunities and target roles.
- Complementary project needs.
- Broad regional proximity or compatible remote preferences.
- Explicit willingness and availability to offer the requested help.

Examples of explanations:

- “You both build accessible web applications.”
- “This member is hiring for an internship in your target field.”
- “You are exploring data science, and this member welcomes questions about entering the field.”

An initial implementation can use transparent tag matching and simple rules. AI is optional and is not necessary for this core experience. Recommendations should not imply guaranteed employment, mentor availability, verified expertise, or an endorsement by the platform.

Sensitive identity information should not be inferred or used as an automatic ranking signal. Any future identity-based discovery would require deliberate consent and a separate product decision. Members should have ways to discover newcomers rather than seeing only highly connected people.

## LinkedIn and profile imports

LinkedIn supports continuity with a member's existing professional presence, while diverse-dmv supplies its own community, discovery, and connections.

### MVP: optional LinkedIn URL

A member can add a LinkedIn profile URL to their profile. This is a link to an external page, not permission to retrieve its contents. The app can provide manual fields for the career information needed for discovery.

### Stretch goal: LinkedIn sign-in

LinkedIn OpenID Connect can support authentication and basic profile information, such as name and photo, with email available in some responses. Developer-app setup and access configuration are required. Sign-in alone does not provide a complete work history, education, skills, connection list, or general people search.

LinkedIn sign-in should remain optional, and should not be presented as identity, employer, or qualification verification.

### Possible later feature: user-approved résumé import

A member could upload their own résumé, review extracted fields, and choose what to publish. Extraction can make mistakes, so nothing should become public without review. The member should be able to remove the uploaded document independently of approved profile fields.

The product does not depend on scraping LinkedIn or importing its social graph. Suggested people come from members who voluntarily join this community.

## Example user journeys

### A student seeking an internship

1. Joins as “Seeking opportunities” and “Networking / exploring.”
2. Adds frontend interests, a class project, and a preference for summer internships.
3. Finds hiring members and peers through relevant filters.
4. Reads why each person appears and reviews their profile.
5. Sends a contextual request to someone who welcomes questions.
6. Sees the accepted connection in their network.

### A professional offering guidance

1. Joins as “Mentoring” and “Networking / exploring.”
2. Offers help with technical interviewing and entering product engineering.
3. Sets limited availability and a preferred short interaction.
4. Reviews incoming requests and accepts those they can support.
5. Pauses new mentoring requests when unavailable.

### A hiring member

1. Joins as “Hiring” and provides their organization and opportunity details.
2. Adds a role's requirements, work arrangement, and application link.
3. Discovers interested members using relevant skills and preferences.
4. Sends a connection request with a clear explanation of the opportunity.
5. Continues the conversation after mutual acceptance.

### A newcomer without a résumé

1. Joins as “Networking / exploring.”
2. Adds learning interests and a small personal project or a question about a field.
3. Discovers peers and professionals who welcome beginner questions.
4. Makes an initial connection without supplying an employer, résumé, or LinkedIn account.

## Privacy, consent, and community safety

Control over visibility is part of the core product, particularly in a community where public association can disclose sensitive personal information.

### Consent-based profiles

- Members create and publish their own profiles.
- Do not pre-create real people's profiles from scraped information.
- Use clearly labeled fictional profiles or consenting participants for demonstrations.
- Let members edit, unpublish, and request deletion of their information.

### Visibility and contact controls

- Default profile discovery to signed-in community members; public web visibility is a separate future choice.
- Make optional identity details and job-seeking status controllable independently.
- Keep account email separate from published contact information.
- Explain what accepting a connection reveals.
- Avoid collecting exact addresses, live locations, or unnecessary sensitive information.

Visibility controls must be enforced by the server or database access rules. Hiding a field in the interface alone does not protect it. Discovery explanations and recommendation responses must also respect those controls.

### Interaction boundaries

- Allow members to decline requests and remove connections.
- Provide blocking and reporting flows.
- Prevent blocked users from sending further requests or interacting through the product.
- Add request limits to discourage spam.
- Distinguish self-reported hiring details from verified claims.
- Establish community guidelines against harassment, discrimination, impersonation, and fraudulent opportunities.

A report button requires an actual review process; the project should not imply continuous moderation before it has the people and tools to provide it. Age eligibility and any safeguards for minors must be decided before opening the service to a broader audience.

## Accessibility and user experience

The interface should make joining and connecting understandable for people with different abilities, backgrounds, and levels of professional experience.

Design goals include:

- Keyboard-operable navigation, forms, filters, and dialogs.
- Visible focus indicators and meaningful control labels.
- Readable contrast, scalable text, and responsive mobile layouts.
- Text labels alongside role colors or icons.
- Semantic page structure and accessible form errors.
- Clear empty, loading, success, and failure states.
- Reduced-motion support and restrained animation.
- Plain language and optional onboarding fields.
- Profile previews that make visibility choices understandable.

Visual customization should support self-expression without compromising readability or navigation. Role badges should make intentions easy to scan without turning roles into a hierarchy.

## Hackathon MVP

The central demonstration is:

**Choose your roles → create a profile → discover relevant people → send a request → accept it → see the connection.**

### Essential features

1. Account creation and authentication.
2. Editable profiles with multiple roles, skills, interests, and optional external links.
3. People discovery with role and interest or skill filters.
4. Simple relevance explanations.
5. Incoming and outgoing connection requests, acceptance, and decline.
6. A network page for accepted connections.
7. Enforced basic visibility settings and connection removal or blocking.
8. A small, clearly labeled demonstration dataset.

### Stretch goals

- LinkedIn sign-in.
- User-reviewed résumé extraction.
- Richer project showcases.
- Structured hiring opportunities.
- Messaging between accepted connections.
- More granular availability and profile visibility.
- Reporting with an administrative review interface.

### Deferred features

- An infinite posting feed, reactions, and reposts.
- A complete applicant tracking or job application system.
- Automated outreach or connection requests.
- Importing LinkedIn connections or searching its entire member base.
- Large-scale identity or employer verification.
- Complex AI recommendation infrastructure.
- Native mobile apps and event-management systems.

These features can be reconsidered after the core connection experience is useful and reliable.

## Proposed screens

| Screen | Purpose | Main actions |
| --- | --- | --- |
| Welcome | Explain the community and its value | Join or sign in |
| Onboarding | Capture intentions and minimal profile information | Select roles, add interests, review visibility |
| Discover | Find relevant people | Filter, inspect relevance, open profiles |
| Member profile | Understand a person and their interests | View work, request a connection |
| Edit profile | Maintain professional information and intentions | Edit roles, links, projects, and visibility |
| Connection requests | Manage introductions | Accept, decline, cancel, block |
| My network | Revisit accepted connections | Open profiles, remove connections |
| Settings | Manage account and privacy choices | Update visibility, unpublish, manage deletion |

## Suggested data model

This is a conceptual model; no framework, database, or authentication provider has been selected.

| Entity | Example information |
| --- | --- |
| Account | Authentication identifier, private email, account state |
| Profile | Display name, headline, bio, optional image, broad location, visibility |
| Profile role | Member, selected role, role-specific preferences, visibility |
| Skill or interest | Label and association with a profile |
| Project | Owner, title, description, skills, optional work link |
| Opportunity | Hiring member, organization, title, requirements, work arrangement, application link |
| Connection request | Sender, recipient, introduction, state, timestamps |
| Connection | Two members and acceptance timestamp |
| Block | Blocking member, blocked member, timestamp |
| Report | Reporter, reported member or content, reason, review state |

The implementation must check ownership when editing profiles and role details, validate connection state transitions, prevent duplicate connections, and apply visibility rules when returning data. Roles guide the experience; selecting “Hiring” or “Mentoring” must not grant administrative privileges or access to private information.

## Why it fits Technica

Technica's mission emphasizes an inclusive tech community. diverse-dmv aims to express that through practical design choices: consent-based representation, accessible participation, opportunities for beginners, and member control over professional visibility.

| Judging criterion | Intended evidence in the project |
| --- | --- |
| Adherence to Technica's mission | A community centered on underrepresented genders, with accessible onboarding and meaningful privacy controls |
| UI/UX design | Clear role selection, readable profiles, understandable relevance, and a straightforward connection journey |
| Functionality and execution | A working journey from account creation to a mutually accepted connection |
| Originality and creativity | Discovery based on current intentions and willingness to help, supported by contextual introductions |
| Adherence to category | A demo and submission description focused on the actual category selected |

UI/UX is a plausible category direction. Education may fit if peer learning becomes central, while accessibility requires demonstrable work to remove participation barriers. Category selection should follow the current published descriptions rather than the category title alone.

## Demo narrative

Use two accounts and clearly labeled fictional community profiles:

1. Introduce a student who wants to find a frontend internship and meet people in the field.
2. Select “Seeking opportunities” and “Networking / exploring.”
3. Add a small project, skills, and career interests.
4. Show relevant members with distinct intentions: a peer, a hiring professional, and someone open to offering guidance.
5. Explain one recommendation using visible, consented profile information.
6. Send a request with a short introduction.
7. Switch accounts, accept the request, and show the resulting connection.
8. Demonstrate a working visibility or blocking control.

The demo should show persisted state across accounts and refreshes. If a feature is simulated or unfinished, label it accurately.

## How to evaluate the idea

Early validation should focus on whether members understand the roles and can make useful connections.

Questions for prospective members:

- Can you express why you joined using these roles?
- What would make you comfortable receiving a connection request?
- What information helps you decide whom to contact?
- Which information would you want to keep private?
- Would you return after the event, and what would bring you back?

Useful early measures include profile completion, discovery-to-request conversion, accepted requests, and member feedback on relevance and comfort. Acceptance rate alone is insufficient: declining a request should remain a valid, pressure-free choice. Collect only the analytics necessary to evaluate these questions.

## Open product decisions

- Final product name, branding, and visual direction.
- How the initial DMV community will be recruited and supported.
- Participation eligibility, including age requirements.
- Authentication method and implementation stack.
- Exact visibility defaults and contact-sharing behavior.
- Whether opportunity cards are needed in the first demo.
- How reports and hiring claims will be reviewed before a public launch.
- Which Technica prize categories best match the completed project.

## Research and references

- [Technica official website](https://gotechnica.org/): current event theme and mission.
- [Technica 2026 on Devpost](https://technica-2026.devpost.com/): judging criteria, challenges, and submission requirements.
- [UMD: Technica's impact on underrepresented genders in tech](https://research.umd.edu/news/innovation-and-inclusion-technicas-impact-underrepresented-genders-tech): event history and community context.
- [UMD: Technica's tenth anniversary](https://cmns.umd.edu/news-events/news/technica-hackathon-10-years): inclusion and intersectional participation.
- [Grace Hopper Celebration official website](https://ghc.anitab.org/): announcement of the 2026 cancellation.
- [LinkedIn sign-in using OpenID Connect](https://learn.microsoft.com/en-us/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2): available basic sign-in information.
- [LinkedIn Connections API](https://learn.microsoft.com/en-us/linkedin/shared/integrations/people/connections-api): approval restrictions on connection access.

These references informed the brainstorming discussion on October 17, 2026. Event details and platform capabilities may change and should be checked again when implementing integrations or preparing a submission.

## License

See [LICENSE](LICENSE) for this repository's license.
