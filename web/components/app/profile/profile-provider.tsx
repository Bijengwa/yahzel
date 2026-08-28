"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { ApiError } from "@/lib/api";
import { fetchProfile, type Profile } from "@/lib/profile";
import { clearSession, getToken, setSessionUser } from "@/lib/session";

type ProfileContextValue = {
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  /** Re-reads the profile from the API. */
  refresh: () => Promise<void>;
  /** Accepts the profile a write returned, so no second request is needed. */
  applyProfile: (profile: Profile) => void;
};

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function useProfile(): ProfileContextValue {
  const value = useContext(ProfileContext);

  if (!value) {
    throw new Error("useProfile must be used inside ProfileProvider.");
  }

  return value;
}

/**
 * Loads the signed-in profile once for the whole authenticated area. Every
 * screen reads it from here, so the sidebar, the completion banner and the
 * profile page can never show three different versions of the same person.
 */
export function ProfileProvider({ children }: { children: ReactNode }) {
  const router = useRouter();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const applyProfile = useCallback((next: Profile) => {
    setProfile(next);

    setSessionUser({
      id: next.id,
      fullName: next.fullName,
      username: next.username,
      email: next.email,
    });
  }, []);

  const load = useCallback(async () => {
    if (!getToken()) {
      router.replace("/auth/login");
      return;
    }

    try {
      const { profile: next } = await fetchProfile();

      applyProfile(next);
      setError(null);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        clearSession();
        router.replace("/auth/login");
        return;
      }

      setError(
        caught instanceof ApiError
          ? caught.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setLoading(false);
    }
  }, [applyProfile, router]);

  useEffect(() => {
    // Loading the profile is exactly what an effect is for: synchronising
    // React with an external system, the Yahzel API. Nothing is set before
    // the first await - the rule cannot see through the async boundary.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  return (
    <ProfileContext.Provider
      value={{ profile, loading, error, refresh: load, applyProfile }}
    >
      {children}
    </ProfileContext.Provider>
  );
}
