import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      {...props}
    />
  );
}

/** Angular, flat-ended strokes, to sit with the mark rather than fight it. */
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
    href: "/profile",
    label: "Profile",
    icon: (
      <Icon>
        <path d="M10 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM3.5 17.5v-1.2c0-2.4 2.9-3.8 6.5-3.8s6.5 1.4 6.5 3.8v1.2" />
      </Icon>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <Icon>
        <path d="M10 7.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6zM10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" />
      </Icon>
    ),
  },
] as const;

/**
 * The rest of the Yahzel ecosystem. Listed, deliberately inert, so the shape
 * of what is coming is visible without pretending any of it is built.
 */
export const FUTURE_AREAS = [
  "Organization",
  "Hiring",
  "Work",
  "Tendering",
  "CV",
] as const;
