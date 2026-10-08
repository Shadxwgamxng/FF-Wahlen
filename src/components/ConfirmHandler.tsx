"use client";
import { useEffect } from "react";

/** Fängt Submit-Klicks auf Buttons mit data-confirm ab und fragt nach. */
export function ConfirmHandler() {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const btn = (e.target as HTMLElement).closest<HTMLElement>("[data-confirm]");
      if (btn && !window.confirm(btn.dataset.confirm)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
