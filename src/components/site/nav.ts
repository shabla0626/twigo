/** The few pages most visitors need; shown in the header. */
export const NAV_LINKS = [
  { href: "/how-it-works", label: "How It Works" },
  { href: "/about", label: "About" },
  { href: "/compensation", label: "Pay & Fairness" },
  { href: "/faq", label: "FAQ" },
] as const;

type NavLink = { href: string; label: string };

/** Everything, grouped for the footer. */
export const MORE_LINKS: { title: string; links: NavLink[] }[] = [
  {
    title: "Joining",
    links: [
      { href: "/how-it-works", label: "How It Works" },
      { href: "/participation", label: "Who Can Participate" },
      { href: "/founding-contributors", label: "Founding Contributors" },
      { href: "/join", label: "Join (create account)" },
      { href: "/login", label: "Sign In" },
    ],
  },
  {
    title: "Organization",
    links: [
      { href: "/about", label: "About" },
      { href: "/compensation", label: "Pay & Fairness" },
      { href: "/work-with-us", label: "For Businesses" },
      { href: "/faq", label: "FAQ" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Policies",
    links: [
      { href: "/community-rules", label: "Community Rules" },
      { href: "/privacy", label: "Privacy Notice" },
      { href: "/terms", label: "Terms & Conditions" },
    ],
  },
];

/** Pages under "More pages" in the phone menu (the header links are listed above it). */
export const MOBILE_MORE_LINKS: NavLink[] = [
  { href: "/participation", label: "Who Can Participate" },
  { href: "/founding-contributors", label: "Founding Contributors" },
  { href: "/work-with-us", label: "For Businesses" },
  { href: "/contact", label: "Contact" },
  { href: "/community-rules", label: "Community Rules" },
  { href: "/privacy", label: "Privacy Notice" },
  { href: "/terms", label: "Terms & Conditions" },
];
