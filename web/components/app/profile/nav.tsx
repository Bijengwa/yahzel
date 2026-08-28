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
    href: "/tendering",
    label: "Tendering",
    icon: (
      <Icon>
        <path d="M4 3h12v14H4zM7 6h6M7 10h6M7 14h4" />
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
 * A proper gear/cog — deliberately distinct from the sun glyph used for the
 * light-theme option, so Settings and Appearance never look like the same
 * icon.
 */
export const SETTINGS_ITEM = {
  href: "/settings",
  label: "Settings",
  icon: (
    <Icon>
      <circle cx="10" cy="10" r="2.5" />
      <path
        d="M10 3.2v1.9M10 14.9v1.9M16.8 10h-1.9M5.1 10H3.2M15.1 4.9l-1.35 1.35M6.25 13.75L4.9 15.1M15.1 15.1l-1.35-1.35M6.25 6.25L4.9 4.9"
        strokeWidth="2.1"
      />
    </Icon>
  ),
};