import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

type DialogFocusOptions = {
  overlayRef: RefObject<HTMLElement | null>;
  panelRef: RefObject<HTMLElement | null>;
  focusKey: string;
  focusSelector: string;
  onClose: () => void;
};

// The overlay can be a body portal or a child of the app shell. Inert its
// siblings in either case, while retaining the caller's own dialog layout.
export function useDialogFocus({
  overlayRef,
  panelRef,
  focusKey,
  focusSelector,
  onClose,
}: DialogFocusOptions) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    const siblings = Array.from(overlay.parentElement?.children ?? []).filter(
      (element) => element !== overlay,
    ) as HTMLElement[];
    const previousInert = siblings.map((element) => element.inert);

    siblings.forEach((element) => {
      element.inert = true;
    });
    document.body.style.overflow = "hidden";

    const onKeyDown = (event: KeyboardEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = Array.from(
        panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const active = document.activeElement;
      if (
        event.shiftKey &&
        (active === first || active === panel || !panel.contains(active))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !panel.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      siblings.forEach((element, index) => {
        element.inert = previousInert[index];
      });
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [overlayRef, panelRef]);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>(focusSelector)?.focus();
  }, [focusKey, focusSelector, panelRef]);

  return () => closeRef.current();
}
