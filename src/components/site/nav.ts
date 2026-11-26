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
    title: "Community",
    links: [
      { href: "/about", label: "About" },
      { href: "/operators", label: "Who operates Twigo" },
      { href: "/compensation", label: "Pay & Fairness" },
      { href: "/support", label: "Community Support" },
      { href: "/work-with-us", label: "For Businesses" },
      { href: "/faq", label: "FAQ" },
      { href: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Policies",
    links: [
      { href: "/legal/terms", label: "Terms of Use" },
      { href: "/legal/privacy", label: "Privacy Policy" },
      { href: "/legal/community-guidelines", label: "Community Guidelines" },
      { href: "/legal", label: "All policies & legal notices" },
    ],
  },
];

/** Pages under "More pages" in the phone menu (the header links are listed above it). */
export const MOBILE_MORE_LINKS: NavLink[] = [
  { href: "/operators", label: "Who operates Twigo" },
  { href: "/participation", label: "Who Can Participate" },
  { href: "/founding-contributors", label: "Founding Contributors" },
  { href: "/work-with-us", label: "For Businesses" },
  { href: "/support", label: "Community Support" },
  { href: "/contact", label: "Contact" },
  { href: "/legal/terms", label: "Terms of Use" },
  { href: "/legal/privacy", label: "Privacy Policy" },
  { href: "/legal/community-guidelines", label: "Community Guidelines" },
  { href: "/legal", label: "All policies & legal notices" },
];
