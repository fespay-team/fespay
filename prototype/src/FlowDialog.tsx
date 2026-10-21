import { useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useDialogFocus } from "./hooks/useDialogFocus.ts";
import "./flow-dialog.css";

type FlowDialogProps = {
  overlayClassName: string;
  panelClassName: string;
  headingId: string;
  focusKey: string;
  onClose: () => void;
  closeOnBackdrop?: boolean;
  children: ReactNode;
};

export default function FlowDialog({
  overlayClassName,
  panelClassName,
  headingId,
  focusKey,
  onClose,
  closeOnBackdrop = false,
  children,
}: FlowDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeDialog = useDialogFocus({
    overlayRef,
    panelRef,
    focusKey,
    focusSelector: `#${headingId}`,
    onClose,
  });

  return createPortal(
    <div
      className={`flow-dialog-overlay ${overlayClassName}`}
      ref={overlayRef}
      onMouseDown={(event) => {
        if (closeOnBackdrop && event.target === event.currentTarget)
          closeDialog();
      }}
    >
      <div
        className={`flow-dialog-panel ${panelClassName}`}
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={headingId}
        tabIndex={-1}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
