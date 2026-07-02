import PhotoCard from "./PhotoCard.jsx";
import "./gallery.css";

// CSS columns give an organic masonry flow. The entrance reveal is a pure CSS
// animation (cheap even for hundreds of items) rather than a per-item JS spring,
// which keeps large galleries smooth. Only the first items in the DOM stagger.
export default function MasonryGrid({
  photos,
  onOpen,
  onToggleFavorite,
  onShare,
  onDelete,
  readOnly = false,
}) {
  return (
    <div className="masonry">
      {photos.map((photo, i) => (
        <div
          key={photo.id}
          className="masonry-item"
          style={{ animationDelay: `${Math.min(i, 16) * 0.03}s` }}
        >
          <PhotoCard
            photo={photo}
            onOpen={() => onOpen(i)}
            onToggleFavorite={onToggleFavorite}
            onShare={onShare}
            onDelete={onDelete}
            readOnly={readOnly}
          />
        </div>
      ))}
    </div>
  );
}
