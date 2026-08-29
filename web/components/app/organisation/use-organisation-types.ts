"use client";

import { useEffect, useState } from "react";

import {
  loadOrganisationVocabulary,
  type OrganisationVocabulary,
} from "@/lib/organisation";

const EMPTY: OrganisationVocabulary = {
  organisationTypes: [],
  participationTypes: [],
  organisationClasses: [],
  designations: [],
};

/**
 * The organisation vocabulary — types, participation types, classes and
 * positions — fetched once from the API per session. Every picker in the
 * Organisation area reads it, so none of them can drift from what the API
 * will accept.
 */
export function useOrganisationVocabulary(): OrganisationVocabulary {
  const [vocabulary, setVocabulary] = useState<OrganisationVocabulary>(EMPTY);

  useEffect(() => {
    let active = true;

    loadOrganisationVocabulary()
      .then((list) => {
        if (active) {
          setVocabulary(list);
        }
      })
      .catch(() => {
        // The pickers fall back to empty lists; every value is validated
        // server-side, so this cannot let an unknown one through.
      });

    return () => {
      active = false;
    };
  }, []);

  return vocabulary;
}
