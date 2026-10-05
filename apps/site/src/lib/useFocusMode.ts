import { useEffect } from "react";

/**
 * While `active`, hides the tool page's title, docs and footer so the tool can use the whole
 * page. Restored when `active` turns false or the component unmounts.
 */
export function useFocusMode(active: boolean) {
  useEffect(() => {
    if (!active) return;
    document.documentElement.setAttribute("data-focus", "");
    return () => document.documentElement.removeAttribute("data-focus");
  }, [active]);
}
