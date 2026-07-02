import { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  IconClose,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconShare,
  IconHeart,
} from "./icons.jsx";
import "./lightbox.css";

export default function Lightbox({
  photos,
  index,
  onClose,
  onNavigate,
  onToggleFavorite,
  onShare,
  readOnly = false,
}) {
  const photo = index != null ? photos[index] : null;

  const go = useCallback(
    (dir) => {
      if (index == null) return;
      const next = (index + dir + photos.length) % photos.length;
      onNavigate(next);
    },
    [index, photos.length, onNavigate]
  );

  useEffect(() => {
    if (index == null) return;
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [index, go, onClose]);

  return (
    <AnimatePresence>
      {photo && (
        <motion.div
          className="lb-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <button className="lb-close chip" onClick={onClose} title="Close (Esc)">
            <IconClose />
          </button>

          {photos.length > 1 && (
            <button
              className="lb-nav lb-prev chip"
              onClick={(e) => {
                e.stopPropagation();
                go(-1);
              }}
            >
              <IconChevronLeft width={26} height={26} />
            </button>
          )}

          <motion.div
            className="lb-stage"
            key={photo.id}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 260, damping: 28 }}
            onClick={(e) => e.stopPropagation()}
          >
            {photo.kind === "video" ? (
              <video
                src={photo.fileUrl}
                className="lb-media"
                controls
                autoPlay
                playsInline
              />
            ) : (
              <img src={photo.fileUrl} alt={photo.originalName} className="lb-media" />
            )}
            <div className="lb-bar glass">
              <div className="lb-meta">
                <span className="lb-name">{photo.originalName}</span>
                {photo.width && photo.height && (
                  <span className="lb-dim">
                    {photo.width} × {photo.height}
                  </span>
                )}
              </div>
              <div className="lb-tools">
                {!readOnly && (
                  <button
                    className={`btn ${photo.isFavorite ? "btn-accent" : ""}`}
                    onClick={() => onToggleFavorite?.(photo)}
                  >
                    <IconHeart
                      width={17}
                      height={17}
                      fill={photo.isFavorite ? "currentColor" : "none"}
                    />
                    {photo.isFavorite ? "Favorited" : "Favorite"}
                  </button>
                )}
                <a className="btn" href={photo.downloadUrl}>
                  <IconDownload width={17} height={17} />
                  Download
                </a>
                {!readOnly && (
                  <button className="btn" onClick={() => onShare?.(photo)}>
                    <IconShare width={17} height={17} />
                    Share
                  </button>
                )}
              </div>
            </div>
          </motion.div>

          {photos.length > 1 && (
            <button
              className="lb-nav lb-next chip"
              onClick={(e) => {
                e.stopPropagation();
                go(1);
              }}
            >
              <IconChevronRight width={26} height={26} />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
