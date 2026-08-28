/**
 * Where the browser keeps the signed-in session.
 *
 * Part 1 established these two keys; every authenticated screen reads them
 * through this module so the storage shape has exactly one definition.
 */

const TOKEN_KEY = "yahzel_token";
const USER_KEY = "yahzel_user";

export type SessionUser = {
  id: number;
  fullName: string;
  username?: string;
  email: string;
};

export function getToken(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window.localStorage.getItem(TOKEN_KEY);
}

export function getSessionUser(): SessionUser | null {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(USER_KEY);

  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}

export function setSessionUser(user: SessionUser): void {
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.sessionStorage.removeItem("yahzel_verification_user");
}
