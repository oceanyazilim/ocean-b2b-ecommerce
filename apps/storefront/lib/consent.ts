import "server-only";

import type { ConsentRulesResponse } from "@ocean/types";
import { cache } from "react";

import { storefrontFetch } from "./api";

// L6 Global Localization (spec section 47): resolved server-side so the root layout can decide
// whether to render the consent banner at all — a visitor who already has a logged ConsentRecord
// (see GET /storefront/v1/consent/rules's `current`) never sees it re-prompt.
export const getConsentRules = cache(async (): Promise<ConsentRulesResponse | null> => {
  try {
    const res = await storefrontFetch<{ data: ConsentRulesResponse }>("/consent/rules");
    return res.data;
  } catch {
    return null;
  }
});
