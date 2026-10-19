/**
 * Site-wide content. Copy is written for this concept; facts and links come
 * from veriangroup.com (retrieved October 2026). External links always point
 * at Verian's real pages.
 */
export const VERIAN = "https://www.veriangroup.com";

export const LINKS = {
  contact: `${VERIAN}/about-us/contact`,
  careers: "https://careers.veriangroup.com/",
  subscribe: "https://share-eu1.hsforms.com/1wpjkCclBR_W8WMU395oEIAg6tq2",
  linkedin: "https://www.linkedin.com/company/veriangroup/",
  locations: `${VERIAN}/about-us/locations`,
  leadership: `${VERIAN}/about-us/global-leadership`,
  institute: `${VERIAN}/verian-institute-for-public-impact`,
  centres: `${VERIAN}/centres-of-excellence`,
  caseStudies: `${VERIAN}/case-studies`,
  insights: `${VERIAN}/news-and-insights`,
  press: "https://g6tq2.share-eu1.hsforms.com/2DuhxHlQlQHG46xteI7vglw",
  policies: `${VERIAN}/policies`,
  cookies: `${VERIAN}/about-us/data-and-cookies-policy`,
  legal: `${VERIAN}/about-us/legal-disclaimers`,
  accessibility: `${VERIAN}/accessbility`,
  original: VERIAN,
  rebrand: `${VERIAN}/news-and-insights/kantar-public-rebrands-globally-to-become-verian`,
} as const;

export const AUTHOR = {
  name: "Ahmed Bader",
  github: "https://github.com/AhmedBader97",
  repo: "https://github.com/AhmedBader97/verian-concept",
} as const;

export const NAV = [
  { href: "/expertise/", label: "Expertise" },
  { href: "/insights/", label: "Insights" },
  { href: "/lab/", label: "AI Lab" },
  { href: "/about/", label: "About" },
  { href: "/careers/", label: "Careers" },
] as const;
