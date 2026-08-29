"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type SVGProps,
} from "react";

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  /** The stored preference, including "system". */
  theme: Theme;
  /** What's actually applied right now — "system" resolved to light/dark. */
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  /** Quick top-bar toggle: flips the resolved appearance explicitly. */
  toggleTheme: () => void;
};

const STORAGE_KEY = "yz-theme";
const WRAPPER_ID = "yz-app-shell";
const MEDIA_QUERY = "(prefers-color-scheme: dark)";

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * The wrapper below server-renders with the default ("dark") class already
 * applied, since the server can't know the OS preference. This blocking,
 * synchronous script runs while that markup is still being parsed — before
 * anything paints — and sets the class to match the real preference (stored
 * light/dark, or the OS setting when following "system"), so there's no
 * flash of the wrong theme on first paint.
 */
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});var dark=t==="light"?false:t==="dark"?true:window.matchMedia(${JSON.stringify(
  MEDIA_QUERY,
)}).matches;var el=document.getElementById(${JSON.stringify(
  WRAPPER_ID,
)});if(el){el.classList.toggle("dark",dark);}document.documentElement.classList.toggle("dark",dark);}catch(e){}})();`;

function readStoredTheme(): Theme {
  if (typeof window === "undefined") {
    return "system";
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system"
      ? stored
      : "system";
  } catch {
    // Storage may be unavailable (private mode, disabled cookies).
    return "system";
  }
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") {
    return true;
  }

  try {
    return window.matchMedia(MEDIA_QUERY).matches;
  } catch {
    return true;
  }
}

function resolveTheme(theme: Theme): ResolvedTheme {
  return theme === "system" ? (systemPrefersDark() ? "dark" : "light") : theme;
}

function readInitialResolvedTheme(): ResolvedTheme {
  if (typeof window === "undefined") {
    // Server render — matches the blocking script's assumption that the
    // wrapper starts "dark" and gets corrected client-side before paint.
    return "dark";
  }

  return resolveTheme(readStoredTheme());
}

/**
 * Mounted once in the root layout, so every screen — the authenticated app
 * *and* the sign-in, registration and verification pages — reads one
 * preference. The default is "system": Yahzel follows the operating system
 * until somebody chooses otherwise, and their choice persists in
 * localStorage under the key above.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(
    readInitialResolvedTheme,
  );

  // The page ground is painted by <body>, which sits outside the wrapper
  // below, so the root element carries the class too — otherwise the area
  // revealed by overscroll keeps the other theme's colour.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  // Follow OS changes live while the preference is "system".
  useEffect(() => {
    if (theme !== "system" || typeof window === "undefined") {
      return;
    }

    const media = window.matchMedia(MEDIA_QUERY);

    function onChange(event: MediaQueryListEvent) {
      setResolvedTheme(event.matches ? "dark" : "light");
    }

    media.addEventListener("change", onChange);

    return () => {
      media.removeEventListener("change", onChange);
    };
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    setResolvedTheme(resolveTheme(next));

    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore — theme still applies for this session via state.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }, [resolvedTheme, setTheme]);

  return (
    <ThemeContext.Provider
      value={{ theme, resolvedTheme, setTheme, toggleTheme }}
    >
      <div
        id={WRAPPER_ID}
        className={`flex min-h-screen flex-1 flex-col ${
          resolvedTheme === "dark" ? "dark" : ""
        }`}
        suppressHydrationWarning
      >
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
        {children}
      </div>
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);

  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }

  return context;
}

export function SunIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <circle cx="10" cy="10" r="3.2" />
      <path d="M10 2.6v1.8M10 15.6v1.8M2.6 10h1.8M15.6 10h1.8M4.9 4.9l1.3 1.3M13.8 13.8l1.3 1.3M15.1 4.9l-1.3 1.3M6.2 13.8l-1.3 1.3" />
    </svg>
  );
}

export function MoonIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d="M16.2 12.5A6.6 6.6 0 0 1 7.5 3.8a6.6 6.6 0 1 0 8.7 8.7z" />
    </svg>
  );
}

/** A simple monitor/display glyph for the "System" option. */
export function SystemIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 20 20"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <rect x="2.6" y="4" width="14.8" height="9.4" rx="1.2" />
      <path d="M7.2 16.6h5.6M10 13.4v3.2" />
    </svg>
  );
}

/** Compact icon toggle for the top workspace bar. */
export function ThemeToggleButton() {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-8 w-8 items-center justify-center rounded-sm text-yz-ink transition-colors hover:bg-yz-neutral-100"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}

/**
 * The three-way appearance control: System, Light, Dark. Settings and the
 * authentication pages both render this one component rather than keeping
 * two versions of the same switch.
 */
export const THEME_OPTIONS: {
  value: Theme;
  label: string;
  icon: typeof SunIcon;
}[] = [
  { value: "system", label: "System", icon: SystemIcon },
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
];

export function ThemeSwitch({
  compact = false,
  className = "",
}: {
  /** Icons only — for the tight header of an authentication page. */
  compact?: boolean;
  className?: string;
}) {
  const { theme, setTheme } = useTheme();

  // The server cannot know the stored preference, so it always renders the
  // default. Marking the selection only after mount keeps the first client
  // render identical to the server's and avoids a hydration mismatch; the
  // effect below then shows the real choice.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  const selected = mounted ? theme : "system";

  return (
    <div
      role="radiogroup"
      aria-label="Theme"
      className={`inline-flex rounded-sm border border-yz-neutral-300 p-0.5 ${className}`}
    >
      {THEME_OPTIONS.map((option) => {
        const active = selected === option.value;
        const Icon = option.icon;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={compact ? option.label : undefined}
            title={compact ? option.label : undefined}
            onClick={() => setTheme(option.value)}
            className={`flex items-center gap-1.5 rounded-sm text-[12px] font-semibold transition-colors duration-150 ${
              compact ? "px-2 py-1.5" : "px-2.5 py-1.5"
            } ${
              active
                ? "bg-yz-neutral-200 text-yz-ink"
                : "text-yz-neutral-600 hover:text-yz-ink"
            }`}
          >
            <Icon width={14} height={14} />
            {!compact && <span>{option.label}</span>}
          </button>
        );
      })}
    </div>
  );
}
