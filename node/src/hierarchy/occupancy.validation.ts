import type { FieldError, Validated } from "../profile/profile.validation.js";
import { validatePositiveId } from "./hierarchy.validation.js";

export type { FieldError, Validated };

/** The organisation_members.id of the person being assigned to a position. */
export function validateMemberId(raw: unknown): Validated<number> {
  return validatePositiveId(raw, "memberId");
}
