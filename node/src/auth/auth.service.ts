import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { createUser, findUserByEmail } from "./auth.repository.js";
import {
  validateLoginInput,
  validateRegisterInput,
  type LoginInput,
  type RegisterInput,
} from "./auth.validation.js";

const SALT_ROUNDS = 10;
const TOKEN_EXPIRY = "7d";

// Never matches a real password — compared against on a missing user so
// login timing doesn't reveal whether an email is registered.
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

  return jwt.sign({ sub: userId }, secret, { expiresIn: TOKEN_EXPIRY });
}

export async function registerUser(input: Partial<RegisterInput>) {
  const result = validateRegisterInput(input);

  if (!result.valid) {
    throw new AuthError(400, result.message);
  }

  const { fullName, email, password } = input as RegisterInput;

  const existing = await findUserByEmail(email);

  if (existing) {
    throw new AuthError(409, "An account with this email already exists.");
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const user = await createUser({ fullName, email, passwordHash });
  const token = signToken(user.id);

  return {
    user: { id: user.id, fullName: user.full_name, email: user.email },
    token,
  };
}

export async function loginUser(input: Partial<LoginInput>) {
  const result = validateLoginInput(input);

  if (!result.valid) {
    throw new AuthError(400, result.message);
  }

  const { email, password } = input as LoginInput;

  const user = await findUserByEmail(email);
  const passwordMatches = await bcrypt.compare(
    password,
    user?.password_hash ?? DUMMY_PASSWORD_HASH,
  );

  if (!user || !passwordMatches) {
    throw new AuthError(401, "Invalid email or password.");
  }

  const token = signToken(user.id);

  return {
    user: { id: user.id, fullName: user.full_name, email: user.email },
    token,
  };
}
