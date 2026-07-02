import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Photos } from "../api/client.js";
import { useToast } from "../components/Toast.jsx";
import MasonryGrid from "../components/MasonryGrid.jsx";
import Lightbox from "../components/Lightbox.jsx";
import ShareModal from "../components/ShareModal.jsx";
import SortControl from "../components/SortControl.jsx";
import { IconShare } from "../components/icons.jsx";

const PAGE = 60;

const pageMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.3 },
};

export default function AllPhotos() {
  const toast = useToast();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true); // initial load
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lightbox, setLightbox] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);
  const [sort, setSort] = useState("date");
  const [order, setOrder] = useState("desc");

  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const sentinelRef = useRef(null);

  // Fetch one page. `reset` reloads from the top (initial mount / after upload).
  const fetchPage = useCallback(
    async (reset) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      const offset = reset ? 0 : offsetRef.current;
      reset ? setLoading(true) : setLoadingMore(true);
      try {
        const batch = await Photos.list({ limit: PAGE, offset, sort, order });
        offsetRef.current = offset + batch.length;
        setHasMore(batch.length === PAGE);
        setPhotos((prev) => {
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
    [toast, sort, order]
  );

  useEffect(() => {
    fetchPage(true);
    const onChange = () => fetchPage(true);
    window.addEventListener("photos:changed", onChange);
    return () => window.removeEventListener("photos:changed", onChange);
  }, [fetchPage]);

  // Infinite scroll: load the next page as the sentinel nears the viewport.
  // Re-attaching when photos.length changes keeps loading until the viewport fills.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !loadingRef.current) fetchPage(false);
      },
      { rootMargin: "800px" }
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, fetchPage, photos.length]);

  const toggleFavorite = async (photo) => {
    const updated = await Photos.toggleFavorite(photo.id);
    setPhotos((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
  };

  const remove = async (photo) => {
    if (!confirm(`Delete "${photo.originalName}"? This cannot be undone.`)) return;
    await Photos.remove(photo.id);
    setPhotos((ps) => ps.filter((p) => p.id !== photo.id));
    offsetRef.current = Math.max(0, offsetRef.current - 1);
    toast("Photo deleted", "success");
  };

  return (
    <motion.div {...pageMotion}>
      <header className="page-head">
        <div>
          <span className="eyebrow">Your library</span>
          <h1 className="page-title">All Photos</h1>
          <p className="page-sub">
            <span className="count-tag">{photos.length}</span>
            {hasMore ? "+" : ""} memories in your gallery
          </p>
        </div>
        <div className="head-actions">
          <SortControl
            sort={sort}
            order={order}
            onChange={(s, o) => {
              setSort(s);
              setOrder(o);
            }}
          />
          {photos.length > 0 && (
            <button
              className="btn"
              onClick={() => setShareTarget({ kind: "all", label: "Entire gallery" })}
            >
              <IconShare width={17} height={17} />
              Share gallery
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <div className="center-state">
          <div className="spin" />
        </div>
      ) : photos.length === 0 ? (
        <div className="center-state">
          <div className="empty-art">🖼️</div>
          <div className="empty-title">No photos yet</div>
          <p>Hit the Upload button to add your first images.</p>
        </div>
      ) : (
        <>
          <MasonryGrid
            photos={photos}
            onOpen={(i) => setLightbox(i)}
            onToggleFavorite={toggleFavorite}
            onShare={(p) =>
              setShareTarget({ kind: "photo", id: p.id, label: p.originalName })
            }
            onDelete={remove}
          />
          {/* Sentinel + loader for infinite scroll */}
          <div ref={sentinelRef} className="scroll-sentinel">
            {loadingMore && <div className="spin" />}
          </div>
        </>
      )}

      <Lightbox
        photos={photos}
        index={lightbox}
        onClose={() => setLightbox(null)}
        onNavigate={setLightbox}
        onToggleFavorite={toggleFavorite}
        onShare={(p) => setShareTarget({ kind: "photo", id: p.id, label: p.originalName })}
      />
      <ShareModal target={shareTarget} onClose={() => setShareTarget(null)} />
    </motion.div>
  );
}
