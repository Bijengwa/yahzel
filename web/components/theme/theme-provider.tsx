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
)});if(el){el.classList.toggle("dark",dark);}}catch(e){}})();`;

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
 * Scoped to the authenticated app only (mounted in `(app)/layout.tsx`), not
 * the root layout — the pre-authentication screens keep their fixed light
 * styling and never receive the `.dark` class or its token overrides.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme);
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(
    readInitialResolvedTheme,
  );

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
        className={resolvedTheme === "dark" ? "dark" : ""}
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
