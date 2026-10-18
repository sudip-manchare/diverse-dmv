import {
  emptyProfile,
  publishSchema,
  type ProfileData,
} from "../src/shared/contracts";

/** Entirely fictional people, schools, employers and opportunities. */
const entries: {
  name: string;
  category: string;
  data: Partial<ProfileData>;
}[] = [
  {
    name: "Maya Chen",
    category: "Student",
    data: {
      headline: "CS student building accessible React experiences",
      intentions: ["seeking"],
      skills: ["React", "TypeScript", "Accessibility", "CSS"],
      hereFor:
        "Find React and accessibility mentors, frontend internship recruiters and peers for an inclusive web project.",
      lookingToConnectWith:
        "Engineers who teach accessible React and TypeScript, frontend recruiters and fellow web learners.",
      education:
        "Third-year computer science student at fictional Potomac Demo University.",
      university: "Potomac Demo University · fictional",
      experienceLevel: "Student",
      desiredRoles: "Frontend engineering intern",
      opportunityTypes: "Internships and project collaborations",
      careerInterests: "Accessible web applications",
      nextStep: "Review my React portfolio and practice interviews",
      happyToHelp:
        "React study groups, CSS layouts and beginner keyboard-access testing",
      projects: [
        {
          title: "Inclusive campus planner · demo",
          description:
            "A fictional React planner with keyboard navigation and clear focus states.",
          url: "",
        },
      ],
      location: "College Park, Maryland",
      fish: "teal",
    },
  },
  {
    name: "Zoe Brooks",
    category: "Student",
    data: {
      headline:
        "Data science student connecting Python, SQL and useful stories",
      intentions: ["seeking"],
      skills: ["Python", "SQL", "PostgreSQL", "Data visualization"],
      hereFor:
        "Find Python and SQL mentors, data internship recruiters and peers building data dashboards.",
      lookingToConnectWith:
        "Data engineers offering PostgreSQL and Python guidance, analytics recruiters and dashboard collaborators.",
      education:
        "Second-year data science student at fictional Chesapeake Demo College.",
      university: "Chesapeake Demo College · fictional",
      experienceLevel: "Student",
      desiredRoles: "Data engineering or analytics intern",
      opportunityTypes: "Internships",
      careerInterests: "Data engineering and accessible analytics",
      nextStep: "Improve a SQL portfolio project",
      happyToHelp: "Python study sessions, SQL queries and data visualization",
      location: "Baltimore, Maryland",
      fish: "sunlight",
    },
  },
  {
    name: "Eli Rivera",
    category: "Student",
    data: {
      headline:
        "Design student exploring inclusive products and frontend prototyping",
      intentions: ["seeking"],
      skills: ["UX research", "Figma", "Accessibility", "React"],
      hereFor:
        "Find UX and accessibility mentors, product design internships and peers for a React prototype.",
      lookingToConnectWith:
        "Inclusive design mentors, product design recruiters and React collaborators.",
      education:
        "Final-year interaction design student at fictional Capital Demo Institute.",
      university: "Capital Demo Institute · fictional",
      experienceLevel: "Student",
      desiredRoles: "Product design intern",
      opportunityTypes: "Internships and junior roles",
      careerInterests: "Inclusive product design",
      nextStep: "Get feedback on a UX case study",
      happyToHelp:
        "Figma prototypes, usability study planning and accessible design",
      location: "Washington, D.C.",
      fish: "coral",
    },
  },
  {
    name: "Quinn Parker",
    category: "Recruiter",
    data: {
      headline: "Demo recruiter for accessible web and data internships",
      intentions: ["hiring"],
      skills: [
        "Frontend recruiting",
        "React",
        "Python",
        "SQL",
        "Interview preparation",
      ],
      hereFor:
        "Meet students and career changers interested in fictional React frontend and Python data internships.",
      lookingToConnectWith:
        "React, TypeScript, accessibility, Python and SQL learners building portfolio projects.",
      hiringOrganization: "Harbor Demo Labs · fictional",
      hiringRelationship: "Fictional internal recruiter",
      opportunitySummary:
        "DEMO ONLY: fictional frontend and data internships using React, TypeScript, Python and SQL. No real vacancy or application process.",
      happyToHelp:
        "Frontend internship preparation, explaining interview stages and Python portfolio feedback",
      location: "Arlington, Virginia",
      fish: "indigo",
    },
  },
  {
    name: "Morgan Lee",
    category: "Recruiter",
    data: {
      headline:
        "Demo recruiter connecting inclusive design and frontend talent",
      intentions: ["hiring"],
      skills: [
        "Product recruiting",
        "UX research",
        "React",
        "Accessibility",
        "Portfolio review",
      ],
      hereFor:
        "Meet emerging product designers and accessible React developers for fictional early-career opportunities.",
      lookingToConnectWith:
        "Students and explorers with UX research, Figma, accessibility or React projects.",
      hiringOrganization: "Rosewater Demo Studio · fictional",
      hiringRelationship: "Fictional talent partner",
      opportunitySummary:
        "DEMO ONLY: fictional junior product design and accessible React roles. No real hiring activity.",
      happyToHelp:
        "UX case-study storytelling, frontend portfolios and accessible interview preparation",
      location: "Washington, D.C.",
      fish: "sunlight",
    },
  },
  {
    name: "Casey Patel",
    category: "Recruiter",
    data: {
      headline: "Demo recruiter for Python, SQL and analytics careers",
      intentions: ["hiring"],
      skills: ["Data recruiting", "Python", "PostgreSQL", "SQL", "Analytics"],
      hereFor:
        "Meet students and explorers interested in fictional Python, SQL and data analytics opportunities.",
      lookingToConnectWith:
        "Python learners, PostgreSQL project builders and people transitioning into data engineering.",
      hiringOrganization: "Chesapeake Demo Analytics · fictional",
      hiringRelationship: "Fictional internal recruiter",
      opportunitySummary:
        "DEMO ONLY: fictional analytics internships and junior data engineering roles using Python and PostgreSQL. No real vacancies.",
      happyToHelp:
        "Data portfolio reviews, SQL interview practice and career-change planning",
      location: "Baltimore, Maryland",
      fish: "teal",
    },
  },
  {
    name: "Sage Williams",
    category: "Mentor",
    data: {
      headline: "Frontend mentor helping learners build accessible React apps",
      intentions: ["mentoring"],
      skills: ["React", "TypeScript", "Accessibility", "Design systems"],
      hereFor:
        "Offer React, TypeScript and web accessibility mentoring to students and career changers.",
      lookingToConnectWith:
        "Frontend learners who want keyboard accessibility, component design and portfolio feedback.",
      mentoringTopics:
        "React, TypeScript, accessible HTML, keyboard navigation and frontend portfolio reviews",
      mentoringAudience: "Students and career changers",
      mentoringInteraction: "Pair programming or a 30-minute portfolio review",
      mentoringAvailability: "accepting",
      happyToHelp:
        "React components, keyboard accessibility and TypeScript interview practice",
      experienceLevel: "Senior engineer · fictional",
      location: "Silver Spring, Maryland",
      fish: "coral",
    },
  },
  {
    name: "Tess Nguyen",
    category: "Mentor",
    data: {
      headline: "Full-stack mentor bridging React dashboards and Python data",
      intentions: ["mentoring"],
      skills: [
        "React",
        "Python",
        "PostgreSQL",
        "TypeScript",
        "Data visualization",
      ],
      hereFor:
        "Help students and explorers connect accessible React dashboards to Python and PostgreSQL data pipelines.",
      lookingToConnectWith:
        "React, Python and SQL learners seeking practical project guidance and portfolio reviews.",
      mentoringTopics:
        "React dashboards, Python pipelines, PostgreSQL, SQL and full-stack portfolio projects",
      mentoringAudience: "Students and emerging engineers",
      mentoringInteraction: "Project review or small-group study session",
      mentoringAvailability: "accepting",
      happyToHelp:
        "React frontend mentoring, Python projects, SQL practice and accessible data dashboards",
      experienceLevel: "Senior full-stack engineer · fictional",
      location: "Reston, Virginia",
      fish: "indigo",
    },
  },
  {
    name: "Remy Davis",
    category: "Mentor",
    data: {
      headline: "Inclusive UX mentor turning research into accessible products",
      intentions: ["mentoring"],
      skills: [
        "UX research",
        "Figma",
        "Accessibility",
        "Design systems",
        "React",
      ],
      hereFor:
        "Offer inclusive UX, accessibility and portfolio mentoring to students and people exploring product careers.",
      lookingToConnectWith:
        "Design learners, React prototypers and career changers seeking user-research and case-study feedback.",
      mentoringTopics:
        "UX research, accessible design, Figma prototypes, design systems and portfolio storytelling",
      mentoringAudience: "Students and career changers",
      mentoringInteraction:
        "Case-study feedback or a prototype accessibility review",
      mentoringAvailability: "accepting",
      happyToHelp:
        "Inclusive UX, React design handoff, accessibility reviews and product design portfolios",
      experienceLevel: "Lead product designer · fictional",
      location: "Alexandria, Virginia",
      fish: "sunlight",
    },
  },
  {
    name: "Alex Kim",
    category: "Explorer",
    data: {
      headline:
        "Career explorer combining React learning with inclusive design",
      intentions: ["networking"],
      skills: ["React", "CSS", "Accessibility", "Figma"],
      hereFor:
        "Find React study partners and accessibility mentors while exploring frontend and UX career paths.",
      lookingToConnectWith:
        "React learners, inclusive design mentors and frontend developers open to small collaborative projects.",
      learningGoals: "Build an accessible React app and learn TypeScript",
      networkingInterests: "Frontend development and inclusive UX",
      collaborationIdeas: "A keyboard-friendly community event planner",
      discussionTopics: "Career changes and accessible web design",
      happyToHelp: "Peer React practice, CSS layouts and usability feedback",
      location: "Washington, D.C.",
      fish: "teal",
    },
  },
  {
    name: "Jordan Ellis",
    category: "Explorer",
    data: {
      headline:
        "Curious builder exploring React dashboards and data storytelling",
      intentions: ["networking"],
      skills: ["React", "Python", "SQL", "Data visualization", "Accessibility"],
      hereFor:
        "Find collaborators and mentors to build an accessible React dashboard using Python and SQL.",
      lookingToConnectWith:
        "React and data learners, Python mentors and people interested in accessible analytics.",
      learningGoals: "Connect React interfaces to PostgreSQL datasets",
      networkingInterests: "Web development and analytics",
      collaborationIdeas: "A fictional community resources dashboard",
      discussionTopics: "Data visualization and learning in public",
      happyToHelp:
        "Peer Python practice, React project ideas and data storytelling",
      location: "Bethesda, Maryland",
      fish: "coral",
    },
  },
  {
    name: "Rowan Shah",
    category: "Explorer",
    data: {
      headline: "Exploring the intersection of data, UX and community projects",
      intentions: ["networking"],
      skills: ["Python", "SQL", "UX research", "Figma", "Data visualization"],
      hereFor:
        "Meet Python, SQL and UX peers to explore accessible data stories and possible career directions.",
      lookingToConnectWith:
        "Data mentors, UX learners and analytics collaborators who enjoy beginner-friendly projects.",
      learningGoals: "Practice SQL and turn findings into a clear UX prototype",
      networkingInterests: "Data careers and product design",
      collaborationIdeas: "An inclusive data storytelling study group",
      discussionTopics: "Career exploration and beginner portfolios",
      happyToHelp:
        "Python study sessions, research synthesis and Figma feedback",
      location: "Fairfax, Virginia",
      fish: "indigo",
    },
  },
];

export const showcaseFixtures = entries.map((entry, index) => {
  const slug = entry.name.toLowerCase().replaceAll(" ", ".");
  return {
    id: `72471000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
    uid: `fictional-showcase-${slug}`,
    email: `demo.${slug}@example.test`,
    name: entry.name,
    category: entry.category,
    data: publishSchema.parse({
      ...emptyProfile(`${entry.name} · demo`),
      bio: `Fictional ${entry.category.toLowerCase()} profile created for the Diverse DMV product demonstration. All experiences and opportunities are illustrative.`,
      workPreferences: ["remote", "hybrid"],
      seekingVisibility: "members",
      ...entry.data,
      fictional: true,
    }),
  };
});
