"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
  type SVGProps,
} from "react";

type Theme = "light" | "dark";

type ThemeContextValue = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const STORAGE_KEY = "yz-theme";
const WRAPPER_ID = "yz-app-shell";

const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * The wrapper below server-renders with the default ("dark") class already
 * applied. This blocking, synchronous script runs while that markup is still
 * being parsed — before anything paints — and strips the class if the
 * stored preference is "light", so returning light-mode users never see a
 * flash of dark first.
 */
const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  STORAGE_KEY,
)});var el=document.getElementById(${JSON.stringify(
  WRAPPER_ID,
)});if(el&&t==="light"){el.classList.remove("dark");}}catch(e){}})();`;

/**
 * Scoped to the authenticated app only (mounted in `(app)/layout.tsx`), not
 * the root layout — the pre-authentication screens keep their fixed light
 * styling and never receive the `.dark` class or its token overrides.
 */
function readInitialTheme(): Theme {
  if (typeof window === "undefined") {
    // Server render — matches the blocking script's assumption that the
    // wrapper starts "dark" and gets corrected client-side if needed.
    return "dark";
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "dark";
  } catch {
    // Storage may be unavailable (private mode, disabled cookies).
    return "dark";
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readInitialTheme);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore — theme still applies for this session via state.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      <div
        id={WRAPPER_ID}
        className={theme === "dark" ? "dark" : ""}
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
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      {...props}
    >
      <circle cx="10" cy="10" r="3.4" />
      <path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4" />
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
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      {...props}
    >
      <path d="M16.2 12.5A6.6 6.6 0 0 1 7.5 3.8a6.6 6.6 0 1 0 8.7 8.7z" />
    </svg>
  );
}

/** Compact icon toggle for the top workspace bar. */
export function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={isDark ? "Switch to light theme" : "Switch to dark theme"}
      title={isDark ? "Switch to light theme" : "Switch to dark theme"}
      className="flex h-9 w-9 items-center justify-center text-yz-ink transition-colors hover:bg-yz-neutral-100"
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
