import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { IconTrash } from "./icons.jsx";
import "./modal.css";

// A styled confirmation dialog to replace native window.confirm(). Sits above the
// Lightbox (see .confirm-backdrop z-index in modal.css) so it can be triggered
// from within it. `busy` disables the actions while the async work runs.
export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onCancel?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop confirm-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={busy ? undefined : onCancel}
        >
          <motion.div
            className="modal glass confirm-modal"
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            role="alertdialog"
            aria-modal="true"
          >
            {danger && (
              <span className="confirm-icon">
                <IconTrash width={24} height={24} />
              </span>
            )}
            <h2 className="modal-title">{title}</h2>
            {message && <p className="modal-desc">{message}</p>}
            <div className="modal-actions">
              <button className="btn" onClick={onCancel} disabled={busy}>
                {cancelLabel}
              </button>
              <button
                className={`btn ${danger ? "btn-danger-solid" : "btn-accent"}`}
                onClick={onConfirm}
                disabled={busy}
              >
                {busy ? "…" : confirmLabel}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
