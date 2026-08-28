const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

export type RegisterInput = {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type LoginInput = {
  email: string;
  password: string;
};

type ValidationResult = { valid: true } | { valid: false; message: string };

export function validateRegisterInput(
  body: Partial<RegisterInput>,
): ValidationResult {
  const { fullName, email, password, confirmPassword } = body;

  if (!fullName || !fullName.trim()) {
    return { valid: false, message: "Full name is required." };
  }

  if (!email || !EMAIL_PATTERN.test(email)) {
    return { valid: false, message: "A valid email address is required." };
  }

  if (!password || password.length < MIN_PASSWORD_LENGTH) {
    return {
      valid: false,
      message: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    };
  }

  if (password !== confirmPassword) {
    return { valid: false, message: "Passwords do not match." };
  }

  return { valid: true };
}

export function validateLoginInput(body: Partial<LoginInput>): ValidationResult {
  const { email, password } = body;

  if (!email || !EMAIL_PATTERN.test(email)) {
    return { valid: false, message: "A valid email address is required." };
  }

  if (!password) {
    return { valid: false, message: "Password is required." };
  }

  return { valid: true };
}
