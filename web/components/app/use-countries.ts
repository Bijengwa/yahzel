"use client";

import { useEffect, useState } from "react";

import { loadCountries, type Country } from "@/lib/countries";

/** The country table, fetched once from the API and cached for the session. */
export function useCountries(): Country[] {
  const [countries, setCountries] = useState<Country[]>([]);

  useEffect(() => {
    let active = true;

    loadCountries()
      .then((list) => {
        if (active) {
          setCountries(list);
        }
      })
      .catch(() => {
        // The picker falls back to an empty list; saving still validates
        // server-side, so this cannot let a bad country through.
      });

    return () => {
      active = false;
    };
  }, []);

  return countries;
}
