import { apiRequest } from "./api";

export type CompletionItem = {
  key: string;
  label: string;
  complete: boolean;
};

export type ProfileCompletion = {
  percent: number;
  completed: number;
  total: number;
  isComplete: boolean;
  missing: string[];
  items: CompletionItem[];
};

export type Profile = {
  id: number;
  fullName: string;
  username: string;

  email: string;
  emailVerified: boolean;
  pendingEmail: string | null;

  phoneNumber: string | null;
  phoneVerified: boolean;

  gender: string | null;
  country: string | null;
  countryName: string | null;
  dialCode: string | null;

  profilePictureUrl: string | null;

  createdAt: string;
  completion: ProfileCompletion;
};

type ProfileResponse = { message?: string; profile: Profile };
type CodeResponse = { message: string; devOtp?: string };

export function fetchProfile(): Promise<ProfileResponse> {
  return apiRequest<ProfileResponse>("/api/profile");
}

export type ProfilePatch = {
  fullName?: string;
  username?: string;
  gender?: string | null;
  country?: string | null;
  phoneNumber?: string | null;
};

export function saveProfile(patch: ProfilePatch): Promise<ProfileResponse> {
  return apiRequest<ProfileResponse>("/api/profile", {
    method: "PATCH",
    body: patch,
  });
}

export function requestEmailChange(
  email: string,
): Promise<ProfileResponse & { devOtp?: string }> {
  return apiRequest("/api/profile/email/change", {
    method: "POST",
    body: { email },
  });
}

export function confirmEmailChange(otp: string): Promise<ProfileResponse> {
  return apiRequest("/api/profile/email/verify", {
    method: "POST",
    body: { otp },
  });
}

export function cancelEmailChange(): Promise<ProfileResponse> {
  return apiRequest("/api/profile/email/cancel", { method: "POST" });
}

export function sendPhoneCode(): Promise<CodeResponse> {
  return apiRequest("/api/profile/phone/send-code", { method: "POST" });
}

export function confirmPhone(otp: string): Promise<ProfileResponse> {
  return apiRequest("/api/profile/phone/verify", {
    method: "POST",
    body: { otp },
  });
}

export function uploadProfilePicture(file: File): Promise<ProfileResponse> {
  return apiRequest("/api/profile/picture", {
    method: "POST",
    raw: { body: file, contentType: file.type },
  });
}

export function removeProfilePicture(): Promise<ProfileResponse> {
  return apiRequest("/api/profile/picture", { method: "DELETE" });
}

export function changePassword(input: {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}): Promise<{ message: string }> {
  return apiRequest("/api/auth/password", { method: "POST", body: input });
}
