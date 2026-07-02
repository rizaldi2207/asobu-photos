import { motion } from "framer-motion";
import { IconHeart, IconDownload, IconShare, IconTrash, IconPlay } from "./icons.jsx";

export default function PhotoCard({
  photo,
  onOpen,
  onToggleFavorite,
  onShare,
  onDelete,
  readOnly,
}) {
  const ratio = photo.width && photo.height ? photo.height / photo.width : 0.72;

  return (
    <motion.figure
      className="photo-card"
      whileHover={{ y: -6 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
    >
      <div
        className="photo-frame"
        style={{ paddingBottom: `${Math.min(Math.max(ratio, 0.5), 1.6) * 100}%` }}
        onClick={onOpen}
      >
        <img
          src={photo.thumbUrl}
          alt={photo.originalName}
          loading="lazy"
          decoding="async"
        />
        {photo.kind === "video" && (
          <span className="play-badge">
            <IconPlay width={22} height={22} />
          </span>
        )}
        <div className="photo-overlay">
          <div className="photo-actions">
            {!readOnly && (
              <button
                className={`chip ${photo.isFavorite ? "chip-fav" : ""}`}
                title="Favorite"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleFavorite?.(photo);
                }}
              >
                <IconHeart
                  width={17}
                  height={17}
                  fill={photo.isFavorite ? "currentColor" : "none"}
                />
              </button>
            )}
            <a
              className="chip"
              title="Download"
              href={photo.downloadUrl}
              onClick={(e) => e.stopPropagation()}
            >
              <IconDownload width={17} height={17} />
            </a>
            {!readOnly && (
              <button
                className="chip"
                title="Share"
                onClick={(e) => {
                  e.stopPropagation();
                  onShare?.(photo);
                }}
              >
                <IconShare width={17} height={17} />
              </button>
            )}
            {!readOnly && onDelete && (
              <button
                className="chip chip-danger"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(photo);
                }}
              >
                <IconTrash width={17} height={17} />
              </button>
            )}
          </div>
          <figcaption className="photo-name">{photo.originalName}</figcaption>
        </div>
        {photo.isFavorite && (
          <span className="fav-badge">
            <IconHeart width={13} height={13} fill="currentColor" />
          </span>
        )}
      </div>
    </motion.figure>
  );
}
