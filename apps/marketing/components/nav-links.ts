// Shared nav model for the header and footer so the two stay in sync.

export const ADMIN_URL = process.env.NEXT_PUBLIC_ADMIN_URL ?? "http://localhost:3001";

export const primaryNav = [
  { href: "/features", label: "Features" },
  { href: "/b2b", label: "B2B" },
  { href: "/wholesale", label: "Wholesale" },
  { href: "/themes", label: "Themes" },
  { href: "/developers", label: "Developers" },
  { href: "/pricing", label: "Pricing" },
] as const;

export const footerColumns = [
  {
    title: "Product",
    links: [
      { href: "/features", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/themes", label: "Themes & store builder" },
      { href: "/developers", label: "Developer platform" },
      { href: "/integrations", label: "Integrations" },
    ],
  },
  {
    title: "Solutions",
    links: [
      { href: "/b2b", label: "B2B commerce" },
      { href: "/wholesale", label: "Wholesale" },
      { href: "/enterprise", label: "Enterprise" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/customers", label: "Customers" },
      { href: "/partners", label: "Partners" },
      { href: "/resources", label: "Resources" },
      { href: "/blog", label: "Blog" },
    ],
  },
  {
    title: "Support",
    links: [
      { href: "/help", label: "Help center" },
      { href: "/status", label: "System status" },
      { href: "/legal/privacy", label: "Privacy policy" },
      { href: "/legal/terms", label: "Terms of service" },
    ],
  },
] as const;
