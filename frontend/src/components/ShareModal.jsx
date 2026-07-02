import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Share } from "../api/client.js";
import { useToast } from "./Toast.jsx";
import { IconClose, IconCopy, IconCheck, IconShare } from "./icons.jsx";
import "./modal.css";

// target: { kind: 'photo'|'album'|'all', id?, label }
export default function ShareModal({ target, onClose }) {
  const toast = useToast();
  const [link, setLink] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!target) return;
    setLink(null);
    setCopied(false);
    setLoading(true);
    Share.create(target.kind, target.id)
      .then((res) => setLink(res))
      .catch((err) =>
        toast(err?.response?.data?.error || "Could not create link", "error")
      )
      .finally(() => setLoading(false));
  }, [target, toast]);

  const copy = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link.url);
    setCopied(true);
    toast("Link copied to clipboard", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <AnimatePresence>
      {target && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="modal glass"
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
          >
            <button className="modal-x chip" onClick={onClose}>
              <IconClose width={18} height={18} />
            </button>
            <span className="eyebrow">Share link</span>
            <h2 className="modal-title">
              <IconShare width={22} height={22} /> {target.label}
            </h2>
            <p className="modal-desc">
              Anyone with this link can view{target.kind === "all" ? " the gallery" : ""} and
              download. The link uses an unguessable token.
            </p>

            {loading ? (
              <div className="share-loading">
                <div className="spin" />
              </div>
            ) : link ? (
              <div className="share-link-row">
                <input className="share-input" readOnly value={link.url} />
                <button className="btn btn-accent" onClick={copy}>
                  {copied ? (
                    <IconCheck width={17} height={17} />
                  ) : (
                    <IconCopy width={17} height={17} />
                  )}
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            ) : null}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
