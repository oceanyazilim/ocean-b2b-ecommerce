"use client";

import { useCallback, useState } from "react";

import { ApiClientError, errorMessage } from "./api";

export interface SubmitState {
  pending: boolean;
  error: string | null;
  fieldErrors: Record<string, string>;
}

// Shared form submission state: one pending flag, one form-level error, per-field errors
// lifted straight from the API's error envelope.
export function useSubmit() {
  const [state, setState] = useState<SubmitState>({ pending: false, error: null, fieldErrors: {} });

  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    setState({ pending: true, error: null, fieldErrors: {} });
    try {
      const result = await fn();
      setState({ pending: false, error: null, fieldErrors: {} });
      return result;
    } catch (error) {
      setState({
        pending: false,
        error: errorMessage(error),
        fieldErrors: error instanceof ApiClientError ? error.fieldErrors() : {},
      });
      return undefined;
    }
  }, []);

  const reset = useCallback(() => setState({ pending: false, error: null, fieldErrors: {} }), []);

  return { ...state, run, reset };
}
