// Display catalog for the pricing page + plan badge. Values mirror the server
// source of truth (functions/_shared/plans.js). Marketing copy only.

export const METRIC_LABELS = {
  notif: "Job alerts",
  autoapply: "Auto-applies",
  cvprep: "CV & cover preps",
  interview: "Interview practice",
};

export const METRIC_ICON = {
  notif: "🔔",
  autoapply: "🤖",
  cvprep: "📄",
  interview: "🧠",
};

export const PLAN_EMOJI = { free: "🆓", starter: "🚀", pro: "💼", proplus: "👑" };
export const PLAN_ORDER = ["free", "starter", "pro", "proplus"];

// Human-readable feature lines per tier (in display order).
export const PLANS = [
  {
    id: "free", label: "Free", price: 0, tagline: "Try it out",
    features: [
      "3 job alerts / day",
      "1 auto-apply / day",
      "1 CV & cover prep / day",
      "1 interview practice / week",
      "1 search country",
    ],
  },
  {
    id: "starter", label: "Starter", price: 5, tagline: "For active seekers",
    features: [
      "10 job alerts / day",
      "5 auto-applies / day",
      "5 CV & cover preps / day",
      "1 interview practice / day",
      "3 search countries",
    ],
  },
  {
    id: "pro", label: "Pro", price: 12, tagline: "Serious job hunt", popular: true,
    features: [
      "25 job alerts / day",
      "15 auto-applies / day",
      "15 CV & cover preps / day",
      "3 interview practices / day",
      "Unlimited countries",
    ],
  },
  {
    id: "proplus", label: "Pro Plus", price: 25, tagline: "Everything, unlimited",
    features: [
      "Unlimited job alerts",
      "40 auto-applies / day",
      "Unlimited CV & cover preps",
      "Unlimited interview practice",
      "Unlimited countries",
    ],
  },
];

export const planEmoji = (id) => PLAN_EMOJI[id] || "🆓";
export const rank = (id) => Math.max(0, PLAN_ORDER.indexOf(id));
