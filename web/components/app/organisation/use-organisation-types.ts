"use client";

import { useEffect, useState } from "react";

import {
  loadOrganisationTypes,
  type OrganisationTypeOption,
} from "@/lib/organisation";

/** The organisation type list, fetched once from the API per session. */
export function useOrganisationTypes(): OrganisationTypeOption[] {
  const [types, setTypes] = useState<OrganisationTypeOption[]>([]);

  useEffect(() => {
    let active = true;

    loadOrganisationTypes()
      .then((list) => {
        if (active) {
          setTypes(list);
        }
      })
      .catch(() => {
        // The picker falls back to an empty list; registering still validates
        // server-side, so this cannot let an unknown type through.
      });

    return () => {
      active = false;
    };
  }, []);

  return types;
}
