import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Resets scroll position when the route pathname changes (SPA default keeps prior scroll).
 */
export function ScrollToTop(): null {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, [pathname]);

  return null;
}
