/**
 * The single row that represents a person in Yahzel.
 *
 * Authentication (Part 1) and the personal profile (Part 2) read and write the
 * same record — there is no second user table — so the shape lives here rather
 * than inside either feature.
 */
export type ProfileRecord = {
  id: number;

  // Identity
  full_name: string;
  username: string;
  gender: string | null;
  country: string | null;
  profile_picture_url: string | null;
  headline: string | null;
  summary: string | null;

  // Credentials
  email: string;
  password_hash: string;
  email_verified: boolean;
  verification_otp: string | null;
  verification_otp_expires_at: string | null;

  // Requested email, not yet trusted
  pending_email: string | null;
  pending_email_otp: string | null;
  pending_email_otp_expires_at: string | null;

  // Contact
  phone_number: string | null;
  phone_verified: boolean;
  phone_verification_otp: string | null;
  phone_verification_otp_expires_at: string | null;

  created_at: string;
  updated_at: string;
};

export const PROFILES_TABLE = "profiles";
