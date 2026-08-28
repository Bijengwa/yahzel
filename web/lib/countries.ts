import { apiRequest } from "./api";

export type Country = {
  code: string;
  name: string;
  dialCode: string;
};

let cache: Country[] | null = null;
let inFlight: Promise<Country[]> | null = null;

/**
 * The API owns the country table, so the picker and the validator can never
 * disagree. The list is static, so one fetch per browser session is enough.
 */
export function loadCountries(): Promise<Country[]> {
  if (cache) {
    return Promise.resolve(cache);
  }

  if (!inFlight) {
    inFlight = apiRequest<{ countries: Country[] }>("/api/reference/countries")
      .then((response) => {
        cache = response.countries;
        return cache;
      })
      .finally(() => {
        inFlight = null;
      });
  }

  return inFlight;
}
