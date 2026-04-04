import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

/** Navigates to the previous route in the history stack (same as the browser Back button). */
export function useGoBack(fallbackPath = "/") {
  const navigate = useNavigate();

  return useCallback(() => {
    const state = window.history.state as { idx?: number } | undefined;
    if (typeof state?.idx === "number" && state.idx > 0) {
      navigate(-1);
    } else {
      navigate(fallbackPath);
    }
  }, [navigate, fallbackPath]);
}
