import type { SVGProps } from "react";

function Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="19"
      height="19"
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

export const SETTINGS_ITEM = {
  href: "/settings",
  label: "Settings",
  icon: (
    <Icon>
      <path d="M10 7.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6z" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" />
    </Icon>
  ),
};