import { findCountry } from "../shared/countries.js";
import type { ProfileRecord } from "../db/profile-record.js";
import {
  describeUniqueViolation,
  emailExists,
  findProfileById,
  phoneNumberExists,
  updateProfile,
  usernameExists,
} from "./profile.repository.js";
import {
  validateCountry,
  validateEmail,
  validateFullName,
  validateGender,
  validatePhoneNumber,
  validateUsername,
  type FieldError,
} from "./profile.validation.js";

const OTP_EXPIRY_MINUTES = 10;

/**
 * Carries field-scoped messages so the browser can put each one under the
 * input that caused it instead of dumping a single banner.
 */
export class ProfileError extends Error {
  status: number;
  errors: FieldError[];

  constructor(status: number, errors: FieldError[]) {
    super(errors[0]?.message ?? "Request failed.");
    this.status = status;
    this.errors = errors;
  }

  static field(status: number, field: string, message: string): ProfileError {
    return new ProfileError(status, [{ field, message }]);
  }
}

/* ------------------------------------------------------------------------
   Profile completion
   --------------------------------------------------------------------- */

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

/**
 * The six things Yahzel needs before a person can take part in what comes
 * next. A profile picture is deliberately *not* required - nobody should be
 * nagged into uploading a photograph.
 */
function computeCompletion(record: ProfileRecord): ProfileCompletion {
  const items: CompletionItem[] = [
    {
      key: "fullName",
      label: "Full name",
      complete: Boolean(record.full_name?.trim()),
    },
    {
      key: "username",
      label: "Username",
      complete: Boolean(record.username?.trim()),
    },
    {
      key: "email",
      label: "Verified email",
      complete: Boolean(record.email) && record.email_verified,
    },
    {
      key: "phoneNumber",
      label: "Verified phone number",
      complete: Boolean(record.phone_number) && record.phone_verified,
    },
    {
      key: "gender",
      label: "Gender",
      complete: Boolean(record.gender),
    },
    {
      key: "country",
      label: "Country",
      complete: Boolean(record.country),
    },
  ];

  const completed = items.filter((item) => item.complete).length;

  return {
    percent: Math.round((completed / items.length) * 100),
    completed,
    total: items.length,
    isComplete: completed === items.length,
    missing: items.filter((item) => !item.complete).map((item) => item.key),
    items,
  };
}

/* ------------------------------------------------------------------------
   Serialisation
   --------------------------------------------------------------------- */

export type PublicProfile = ReturnType<typeof toPublicProfile>;

/**
 * The only shape that ever leaves the API. Password hashes, one-time codes
 * and their expiry timestamps are not in it.
 */
export function toPublicProfile(record: ProfileRecord) {
  const country = findCountry(record.country);

  return {
    id: record.id,
    fullName: record.full_name,
    username: record.username,

    email: record.email,
    emailVerified: record.email_verified,
    pendingEmail: record.pending_email,

    phoneNumber: record.phone_number,
    phoneVerified: record.phone_verified,

    gender: record.gender,
    country: record.country,
    countryName: country?.name ?? null,
    dialCode: country?.dialCode ?? null,

    // Path on the API host, e.g. /uploads/avatars/ab12.png. The web client
    // joins it with the API origin.
    profilePictureUrl: record.profile_picture_url,

    createdAt: record.created_at,
    completion: computeCompletion(record),
  };
}

/* ------------------------------------------------------------------------
   One-time codes
   --------------------------------------------------------------------- */

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function otpExpiry(): Date {
  return new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000);
}

function announceOtp(label: string, target: string, otp: string): void {
  console.log("");
  console.log("======================================");
  console.log(`YAHZEL ${label}`);
  console.log(`To: ${target}`);
  console.log(`OTP: ${otp}`);
  console.log("======================================");
  console.log("");
}

/**
 * Yahzel has no SMS or mail provider yet, so outside production the code is
 * returned to the caller as well as printed. Production gets neither, which
 * is what makes it safe to leave this in.
 */
function developmentOtp(otp: string): { devOtp?: string } {
  return process.env.NODE_ENV === "production" ? {} : { devOtp: otp };
}

function isExpired(timestamp: string | null): boolean {
  return !timestamp || new Date(timestamp).getTime() < Date.now();
}

/* ------------------------------------------------------------------------
   Reads
   --------------------------------------------------------------------- */

async function requireProfile(userId: number): Promise<ProfileRecord> {
  const record = await findProfileById(userId);

  if (!record) {
    throw ProfileError.field(404, "form", "Your profile could not be found.");
  }

  return record;
}

export async function getProfile(userId: number) {
  return toPublicProfile(await requireProfile(userId));
}

/* ------------------------------------------------------------------------
   Update
   --------------------------------------------------------------------- */

export type ProfilePatchInput = {
  fullName?: unknown;
  username?: unknown;
  gender?: unknown;
  country?: unknown;
  phoneNumber?: unknown;
};

/**
 * Applies whichever of the editable fields were sent. Email is not one of
 * them - it moves through the verification flow below.
 */
export async function patchProfile(userId: number, input: ProfilePatchInput) {
  const record = await requireProfile(userId);

  const patch: Partial<ProfileRecord> = {};
  const errors: FieldError[] = [];

  if ("fullName" in input) {
    const result = validateFullName(input.fullName);

    if (result.ok) {
      patch.full_name = result.value;
    } else {
      errors.push(...result.errors);
    }
  }

  if ("username" in input) {
    const result = validateUsername(input.username);

    if (!result.ok) {
      errors.push(...result.errors);
    } else if (result.value !== record.username) {
      if (await usernameExists(result.value, { excludeId: userId })) {
        errors.push({
          field: "username",
          message: "That username is already taken.",
        });
      } else {
        patch.username = result.value;
      }
    }
  }

  if ("gender" in input) {
    const result = validateGender(input.gender);

    if (result.ok) {
      patch.gender = result.value;
    } else {
      errors.push(...result.errors);
    }
  }

  // Country is resolved before the phone number so a number sent in the same
  // request is checked against the country sent with it.
  let effectiveCountry = record.country;

  if ("country" in input) {
    const result = validateCountry(input.country);

    if (result.ok) {
      patch.country = result.value;
      effectiveCountry = result.value;
    } else {
      errors.push(...result.errors);
    }
  }

  if ("phoneNumber" in input) {
    const result = validatePhoneNumber(input.phoneNumber, effectiveCountry);

    if (!result.ok) {
      errors.push(...result.errors);
    } else if (result.value !== record.phone_number) {
      if (
        result.value &&
        (await phoneNumberExists(result.value, { excludeId: userId }))
      ) {
        errors.push({
          field: "phoneNumber",
          message: "That phone number is already in use.",
        });
      } else {
        // A new number is an unverified number, every time.
        patch.phone_number = result.value;
        patch.phone_verified = false;
        patch.phone_verification_otp = null;
        patch.phone_verification_otp_expires_at = null;
      }
    }
  }

  if (errors.length > 0) {
    throw new ProfileError(422, errors);
  }

  if (Object.keys(patch).length === 0) {
    return toPublicProfile(record);
  }

  try {
    return toPublicProfile(await updateProfile(userId, patch));
  } catch (error) {
    const conflict = describeUniqueViolation(error);

    if (conflict) {
      throw ProfileError.field(409, conflict.field, conflict.message);
    }

    throw error;
  }
}

/* ------------------------------------------------------------------------
   Email change - the new address is never trusted on sight
   --------------------------------------------------------------------- */

export async function requestEmailChange(userId: number, rawEmail: unknown) {
  const record = await requireProfile(userId);

  const result = validateEmail(rawEmail);

  if (!result.ok) {
    throw new ProfileError(422, result.errors);
  }

  const email = result.value;

  if (email === record.email) {
    throw ProfileError.field(422, "email", "That is already your email address.");
  }

  if (await emailExists(email, { excludeId: userId })) {
    throw ProfileError.field(
      409,
      "email",
      "That email address is already in use.",
    );
  }

  const otp = generateOtp();

  const updated = await updateProfile(userId, {
    pending_email: email,
    pending_email_otp: otp,
    pending_email_otp_expires_at: otpExpiry().toISOString(),
  });

  announceOtp("EMAIL CHANGE CODE", email, otp);

  return {
    message: `We sent a 6-digit code to ${email}. Your current email stays active until you confirm.`,
    profile: toPublicProfile(updated),
    ...developmentOtp(otp),
  };
}

export async function verifyEmailChange(userId: number, rawOtp: unknown) {
  const record = await requireProfile(userId);

  const otp = String(rawOtp ?? "").trim();

  if (!record.pending_email) {
    throw ProfileError.field(
      400,
      "otp",
      "There is no email change waiting to be confirmed.",
    );
  }

  if (isExpired(record.pending_email_otp_expires_at)) {
    throw ProfileError.field(
      400,
      "otp",
      "That code has expired. Request a new one.",
    );
  }

  if (!record.pending_email_otp || record.pending_email_otp !== otp) {
    throw ProfileError.field(400, "otp", "That code is not correct.");
  }

  // Somebody else may have claimed the address while this code was in flight.
  if (await emailExists(record.pending_email, { excludeId: userId })) {
    await updateProfile(userId, {
      pending_email: null,
      pending_email_otp: null,
      pending_email_otp_expires_at: null,
    });

    throw ProfileError.field(
      409,
      "email",
      "That email address was taken while you were confirming. Try another one.",
    );
  }

  try {
    const updated = await updateProfile(userId, {
      email: record.pending_email,
      email_verified: true,
      pending_email: null,
      pending_email_otp: null,
      pending_email_otp_expires_at: null,
    });

    return {
      message: "Your email address has been updated and verified.",
      profile: toPublicProfile(updated),
    };
  } catch (error) {
    const conflict = describeUniqueViolation(error);

    if (conflict) {
      throw ProfileError.field(409, conflict.field, conflict.message);
    }

    throw error;
  }
}

export async function cancelEmailChange(userId: number) {
  await requireProfile(userId);

  const updated = await updateProfile(userId, {
    pending_email: null,
    pending_email_otp: null,
    pending_email_otp_expires_at: null,
  });

  return {
    message: "Email change cancelled.",
    profile: toPublicProfile(updated),
  };
}

/* ------------------------------------------------------------------------
   Phone verification - mocked until an SMS provider exists
   --------------------------------------------------------------------- */

export async function sendPhoneCode(userId: number) {
  const record = await requireProfile(userId);

  if (!record.phone_number) {
    throw ProfileError.field(
      400,
      "phoneNumber",
      "Add a phone number before requesting a code.",
    );
  }

  if (record.phone_verified) {
    throw ProfileError.field(
      400,
      "phoneNumber",
      "This phone number is already verified.",
    );
  }

  const otp = generateOtp();

  await updateProfile(userId, {
    phone_verification_otp: otp,
    phone_verification_otp_expires_at: otpExpiry().toISOString(),
  });

  announceOtp("PHONE VERIFICATION CODE", record.phone_number, otp);

  return {
    message: `We sent a 6-digit code to ${record.phone_number}.`,
    ...developmentOtp(otp),
  };
}

export async function verifyPhone(userId: number, rawOtp: unknown) {
  const record = await requireProfile(userId);

  const otp = String(rawOtp ?? "").trim();

  if (!record.phone_number) {
    throw ProfileError.field(
      400,
      "phoneNumber",
      "Add a phone number before verifying.",
    );
  }

  if (record.phone_verified) {
    return {
      message: "This phone number is already verified.",
      profile: toPublicProfile(record),
    };
  }

  if (!record.phone_verification_otp) {
    throw ProfileError.field(400, "otp", "Request a code before entering one.");
  }

  if (isExpired(record.phone_verification_otp_expires_at)) {
    throw ProfileError.field(
      400,
      "otp",
      "That code has expired. Request a new one.",
    );
  }

  if (record.phone_verification_otp !== otp) {
    throw ProfileError.field(400, "otp", "That code is not correct.");
  }

  const updated = await updateProfile(userId, {
    phone_verified: true,
    phone_verification_otp: null,
    phone_verification_otp_expires_at: null,
  });

  return {
    message: "Your phone number has been verified.",
    profile: toPublicProfile(updated),
  };
}

/* ------------------------------------------------------------------------
   Profile picture
   --------------------------------------------------------------------- */

export async function setProfilePicture(userId: number, publicPath: string) {
  const record = await requireProfile(userId);

  const updated = await updateProfile(userId, {
    profile_picture_url: publicPath,
  });

  return {
    message: "Profile picture updated.",
    profile: toPublicProfile(updated),
    replacedPath: record.profile_picture_url,
  };
}

export async function clearProfilePicture(userId: number) {
  const record = await requireProfile(userId);

  if (!record.profile_picture_url) {
    return {
      message: "There is no profile picture to remove.",
      profile: toPublicProfile(record),
      removedPath: null as string | null,
    };
  }

  const updated = await updateProfile(userId, { profile_picture_url: null });

  return {
    message: "Profile picture removed.",
    profile: toPublicProfile(updated),
    removedPath: record.profile_picture_url,
  };
}
