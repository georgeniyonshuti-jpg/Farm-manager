import { useEffect } from "react";
import { useToast } from "./Toast";

/** Shows a one-time Murakoze toast when the user switches to Kinyarwanda. */
export function LocaleToastBridge() {
  const { showToast } = useToast();

  useEffect(() => {
    const onRw = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      const message = detail?.message?.trim();
      if (message) showToast("success", message);
    };
    window.addEventListener("cleva-locale-rw", onRw);
    return () => window.removeEventListener("cleva-locale-rw", onRw);
  }, [showToast]);

  return null;
}
