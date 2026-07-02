import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Photos } from "../api/client.js";
import { useToast } from "../components/Toast.jsx";
import MasonryGrid from "../components/MasonryGrid.jsx";
import Lightbox from "../components/Lightbox.jsx";
import ShareModal from "../components/ShareModal.jsx";

const pageMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.3 },
};

export default function Favorites() {
  const toast = useToast();
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);

  const load = useCallback(() => {
    setLoading(true);
    Photos.favorites()
      .then(setPhotos)
      .catch(() => toast("Could not load favorites", "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Un-favoriting from this view removes it from the list.
  const toggleFavorite = async (photo) => {
    const updated = await Photos.toggleFavorite(photo.id);
    if (!updated.isFavorite) {
      setPhotos((ps) => ps.filter((p) => p.id !== photo.id));
      setLightbox(null);
    }
  };

  return (
    <motion.div {...pageMotion}>
      <header className="page-head">
        <div>
          <span className="eyebrow">Curated</span>
          <h1 className="page-title">Favorites</h1>
          <p className="page-sub">
            <span className="count-tag">{photos.length}</span> photos you loved
          </p>
        </div>
      </header>

      {loading ? (
        <div className="center-state">
          <div className="spin" />
        </div>
      ) : photos.length === 0 ? (
        <div className="center-state">
          <div className="empty-art">💛</div>
          <div className="empty-title">No favorites yet</div>
          <p>Tap the heart on any photo to keep it here.</p>
        </div>
      ) : (
        <MasonryGrid
          photos={photos}
          onOpen={(i) => setLightbox(i)}
          onToggleFavorite={toggleFavorite}
          onShare={(p) => setShareTarget({ kind: "photo", id: p.id, label: p.originalName })}
        />
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
