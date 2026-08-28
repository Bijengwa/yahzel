import { clearSession, getToken } from "./session";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";

export type FieldError = { field: string; message: string };

/**
 * A failed request, carrying whatever field-scoped messages the API sent so a
 * form can show each one under the input it belongs to.
 */
export class ApiError extends Error {
  status: number;
  errors: FieldError[];

  constructor(status: number, message: string, errors: FieldError[] = []) {
    super(message);
    this.status = status;
    this.errors = errors;
  }

  /** The message for one input, if the API pinned one to it. */
  forField(field: string): string | undefined {
    return this.errors.find((error) => error.field === field)?.message;
  }

  /** Messages keyed by input name, for setting form state in one go. */
  byField(): Record<string, string> {
    return Object.fromEntries(
      this.errors.map((error) => [error.field, error.message]),
    );
  }
}

type RequestOptions = {
  method?: string;
  body?: unknown;
  /** Sent as the raw request body with this content type. */
  raw?: { body: BodyInit; contentType: string };
};

/**
 * Every call to the Yahzel API goes through here: it attaches the bearer
 * token, turns a non-2xx response into an `ApiError`, and signs the person
 * out if the token is no longer good.
 */
export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const token = getToken();

  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let body: BodyInit | undefined;

  if (options.raw) {
    headers["Content-Type"] = options.raw.contentType;
    body = options.raw.body;
  } else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }

  let response: Response;

  try {
    response = await fetch(`${API_URL}${path}`, {
      method: options.method ?? "GET",
      headers,
      ...(body === undefined ? {} : { body }),
    });
  } catch {
    throw new ApiError(0, "Cannot reach Yahzel. Check your connection.");
  }

  const payload = (await response.json().catch(() => ({}))) as {
    message?: string;
    errors?: FieldError[];
  };

  if (!response.ok) {
    if (response.status === 401) {
      clearSession();
    }

    throw new ApiError(
      response.status,
      payload.message ?? "Something went wrong. Please try again.",
      payload.errors ?? [],
    );
  }

  return payload as T;
}

/** Joins an API-relative upload path with the API origin. */
export function assetUrl(path: string | null): string | null {
  return path ? `${API_URL}${path}` : null;
}
