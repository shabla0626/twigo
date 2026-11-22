/** Answers for the three application steps (what the form would send). */
export function applicationAnswers(overrides: { about?: Record<string, unknown>; skills?: Record<string, unknown>; motivation?: Record<string, unknown> } = {}) {
  return {
    about: { country: "Testland", region: "", occupation: "Shop assistant", education: "", profileUrl: "", experienceLevel: "NONE", relevantExperience: "", ...overrides.about },
    skills: {
      mainSkills: "Data entry, Online research",
      secondarySkills: "Spreadsheets, data entry",
      workCategories: ["GENERAL_REMOTE", "RESEARCH"],
      desiredWork: "Research and data organization",
      hoursPerWeek: "5",
      schedule: "Weekends",
      willingToLearn: true,
      ...overrides.skills,
    },
    motivation: {
      motivation: "I would like to earn additional income by working with a team.",
      contribution: "Reliable and careful data work, done on time.",
      additionalComments: "",
      ...overrides.motivation,
    },
  };
}

