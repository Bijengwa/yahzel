import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="19"
      height="19"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    />
  );
}

export const NAV_ITEMS = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: (
      <Icon>
        <path d="M3 3h6v6H3zM11 3h6v4h-6zM11 9h6v8h-6zM3 11h6v6H3z" />
      </Icon>
    ),
  },
  {
    href: "/work",
    label: "Work",
    icon: (
      <Icon>
        <path d="M3 6h14v10H3zM6 6V4h8v2M7 10h6M10 8v4" />
      </Icon>
    ),
  },
  {
    href: "/hiring",
    label: "Hiring",
    icon: (
      <Icon>
        <path d="M3 16v-1.2c0-2.4 2.9-3.8 7-3.8s7 1.4 7 3.8V16M6.2 6.5a3.8 3.8 0 1 0 7.6 0 3.8 3.8 0 0 0-7.6 0z" />
      </Icon>
    ),
  },
  {
    /**
     * An institution: a main block with a lower annex, standing on a ground
     * line. Deliberately a *building*, not a briefcase (Work) or a document
     * (CV) — an organisation is a place people belong to.
     */
    href: "/organisation",
    label: "Organisation",
    icon: (
      <Icon>
        <path d="M2.6 17h14.8" />
        <path d="M4.4 17V5.6h6.6V17" />
        <path d="M11 9.8h4.6V17" />
        <path d="M6.6 8.4h2.2M6.6 11.4h2.2M12.8 12.6h1.4" />
      </Icon>
    ),
  },
  {
    href: "/cv",
    label: "CV",
    icon: (
      <Icon>
        <path d="M5 3h10v14H5zM7.5 7h5M7.5 10h5M7.5 13h3" />
      </Icon>
    ),
  },
] as const;

/**
 * A toothed gear. The sun and moon glyphs belong to the appearance control
 * and nothing else — Settings gets the one shape every interface agrees
 * means "settings".
 */
export const SETTINGS_ITEM = {
  href: "/settings",
  label: "Settings",
  icon: (
    <Icon>
      <path d="M8.54 5.22L8.66 3.13A7 7 0 0 1 11.34 3.13L11.46 5.22A5 5 0 0 1 12.35 5.59L13.91 4.20A7 7 0 0 1 15.80 6.09L14.41 7.65A5 5 0 0 1 14.78 8.54L16.87 8.66A7 7 0 0 1 16.87 11.34L14.78 11.46A5 5 0 0 1 14.41 12.35L15.80 13.91A7 7 0 0 1 13.91 15.80L12.35 14.41A5 5 0 0 1 11.46 14.78L11.34 16.87A7 7 0 0 1 8.66 16.87L8.54 14.78A5 5 0 0 1 7.65 14.41L6.09 15.80A7 7 0 0 1 4.20 13.91L5.59 12.35A5 5 0 0 1 5.22 11.46L3.13 11.34A7 7 0 0 1 3.13 8.66L5.22 8.54A5 5 0 0 1 5.59 7.65L4.20 6.09A7 7 0 0 1 6.09 4.20L7.65 5.59A5 5 0 0 1 8.54 5.22Z" />
      <circle cx="10" cy="10" r="2.3" />
    </Icon>
  ),
};
