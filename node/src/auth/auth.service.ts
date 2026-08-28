import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

import {
  createUser,
  findUserByEmail,
  findUserById,
  markEmailAsVerified,
  saveVerificationOtp,
} from "./auth.repository.js";

import {
  validateLoginInput,
  validateRegisterInput,
  type LoginInput,
  type RegisterInput,
} from "./auth.validation.js";

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = "7d";
const OTP_EXPIRY_MINUTES = 10;

const DUMMY_PASSWORD_HASH =
  "$2a$10$C6UzMDM.H6dfI/f/IKcEeO0Vt.9y7iX9jHyO6yQq5Xz5x5x5x5x5u";

export class AuthError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function signToken(userId: number): string {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    throw new Error("JWT_SECRET environment variable is required.");
  }

  return jwt.sign({ sub: userId }, secret, {
    expiresIn: TOKEN_EXPIRY,
  });
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function createVerificationOtp(userId: number): Promise<string> {
  const otp = generateOtp();

  const expiresAt = new Date(
    Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000,
  );

  await saveVerificationOtp(userId, otp, expiresAt);

  console.log("");
  console.log("======================================");
  console.log("YAHZEL VERIFICATION OTP");
  console.log(`User ID: ${userId}`);
  console.log(`OTP: ${otp}`);
  console.log(`Expires: ${expiresAt.toISOString()}`);
  console.log("======================================");
  console.log("");

  return otp;
}

export async function registerUser(
  input: Partial<RegisterInput>,
) {
  const result = validateRegisterInput(input);

  if (!result.valid) {
    throw new AuthError(400, result.message);
  }

  const { fullName, email, password } = input as RegisterInput;

  const normalizedEmail = email.trim().toLowerCase();

  const existing = await findUserByEmail(normalizedEmail);

  if (existing) {
    throw new AuthError(
      409,
      "An account with this email already exists.",
    );
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await createUser({
    fullName: fullName.trim(),
    email: normalizedEmail,
    passwordHash,
  });

  await createVerificationOtp(user.id);

  return {
    message: "Account created. Please verify your email.",
    requiresVerification: true,
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
    },
  };
}

export async function loginUser(input: Partial<LoginInput>) {
  const result = validateLoginInput(input);

  if (!result.valid) {
    throw new AuthError(400, result.message);
  }

  const { email, password } = input as LoginInput;

  const normalizedEmail = email.trim().toLowerCase();

  const user = await findUserByEmail(normalizedEmail);

  const passwordMatches = await bcrypt.compare(
    password,
    user?.password_hash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordMatches) {
    throw new AuthError(401, "Invalid email or password.");
  }

  if (!user.email_verified) {
    await createVerificationOtp(user.id);

    return {
      requiresVerification: true,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
      },
    };
  }

  const token = signToken(user.id);

  return {
    requiresVerification: false,
    token,
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
    },
  };
}

export async function verifyUserEmail(
  userId: number,
  otp: string,
) {
  const user = await findUserById(userId);

  if (!user) {
    throw new AuthError(404, "User not found.");
  }

  if (user.email_verified) {
    const token = signToken(user.id);

    return {
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
      },
    };
  }

  if (!user.verification_otp) {
    throw new AuthError(
      400,
      "No verification code is available. Please request a new code.",
    );
  }

  if (
    !user.verification_otp_expires_at ||
    new Date(user.verification_otp_expires_at).getTime() <
      Date.now()
  ) {
    throw new AuthError(
      400,
      "This verification code has expired. Please request a new code.",
    );
  }

  if (user.verification_otp !== otp) {
    throw new AuthError(400, "Invalid verification code.");
  }

  await markEmailAsVerified(user.id);

  const token = signToken(user.id);

  return {
    token,
    user: {
      id: user.id,
      fullName: user.full_name,
      email: user.email,
    },
  };
}

export async function resendVerificationCode(userId: number) {
  const user = await findUserById(userId);

  if (!user) {
    throw new AuthError(404, "User not found.");
  }

  if (user.email_verified) {
    throw new AuthError(400, "This email is already verified.");
  }

  await createVerificationOtp(user.id);

  return {
    message: "A new verification code has been generated.",
  };
}