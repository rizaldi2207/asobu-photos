import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Photos, Albums } from "../api/client.js";
import { useToast } from "./Toast.jsx";
import { IconClose } from "./icons.jsx";
import "./modal.css";

const PAGE = 48;

// Library photo picker with its own infinite scroll. The IntersectionObserver
// uses the scrollable grid as its root, so it pages while the user scrolls the
// modal — not the page behind it. Photos already in the album are greyed out.
export default function PhotoPicker({ open, albumId, onClose, onConfirm }) {
  const toast = useToast();
  const [items, setItems] = useState([]);
  const [inAlbumIds, setInAlbumIds] = useState(new Set());
  const [selected, setSelected] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const gridRef = useRef(null);
  const sentinelRef = useRef(null);

  const fetchPage = useCallback(
    async (reset) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      const offset = reset ? 0 : offsetRef.current;
      reset ? setLoading(true) : setLoadingMore(true);
      try {
        const batch = await Photos.list({ limit: PAGE, offset });
        offsetRef.current = offset + batch.length;
        setHasMore(batch.length === PAGE);
        setItems((prev) => {
          const base = reset ? [] : prev;
          const seen = new Set(base.map((p) => p.id));
          return [...base, ...batch.filter((p) => !seen.has(p.id))];
        });
      } catch {
        toast("Could not load photos", "error");
      } finally {
        loadingRef.current = false;
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [toast]
  );

  // On open: reset, load the first page, and fetch the album's full membership.
  useEffect(() => {
    if (!open) return;
    setItems([]);
    setSelected(new Set());
    setHasMore(true);
    offsetRef.current = 0;
    fetchPage(true);
    Albums.listPhotos(albumId)
      .then((m) => setInAlbumIds(new Set(m.map((p) => p.id))))
      .catch(() => {});
  }, [open, albumId, fetchPage]);

  // Infinite scroll bound to the grid's own scroll viewport.
  useEffect(() => {
    if (!open || !hasMore) return;
    const node = sentinelRef.current;
    const root = gridRef.current;
    if (!node || !root) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingRef.current) fetchPage(false);
      },
      { root, rootMargin: "200px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [open, hasMore, fetchPage, items.length]);

  const toggleSel = (pid) => {
    setSelected((s) => {
      const next = new Set(s);
      next.has(pid) ? next.delete(pid) : next.add(pid);
      return next;
    });
  };

  return (
    <AnimatePresence>
      {open && (
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
            style={{ maxWidth: 640 }}
          >
            <button className="modal-x chip" onClick={onClose}>
              <IconClose width={18} height={18} />
            </button>
            <span className="eyebrow">Add to album</span>
            <h2 className="modal-title">Select photos</h2>

            {loading ? (
              <div className="share-loading">
                <div className="spin" />
              </div>
            ) : items.length === 0 ? (
              <p className="modal-desc">No photos in your library yet.</p>
            ) : (
              <div className="picker-grid" ref={gridRef}>
                {items.map((p) => {
                  const isIn = inAlbumIds.has(p.id);
                  return (
                    <div
                      key={p.id}
                      className={`picker-tile ${selected.has(p.id) ? "sel" : ""}`}
                      onClick={() => !isIn && toggleSel(p.id)}
                      style={isIn ? { opacity: 0.35, cursor: "default" } : {}}
                      title={isIn ? "Already in album" : p.originalName}
                    >
                      <img src={p.thumbUrl} alt={p.originalName} loading="lazy" decoding="async" />
                    </div>
                  );
                })}
                <div ref={sentinelRef} className="picker-sentinel">
                  {loadingMore && <div className="spin" />}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn" onClick={onClose}>
                Cancel
              </button>
              <button
                className="btn btn-accent"
                onClick={() => onConfirm([...selected])}
                disabled={selected.size === 0}
              >
                Add {selected.size > 0 ? `(${selected.size})` : ""}
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
