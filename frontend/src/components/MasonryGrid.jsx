import { useEffect, useState } from "react";
import PhotoCard from "./PhotoCard.jsx";
import "./gallery.css";

// Responsive column count, mirroring the old CSS breakpoints exactly. We need
// this in JS (not CSS columns) because a horizontal, row-major reading order
// requires distributing items across explicit column containers ourselves.
function columnsForWidth(w) {
  if (w <= 560) return 1;
  if (w <= 1000) return 2;
  if (w <= 1500) return 3;
  return 4;
}
function useColumnCount() {
  const [count, setCount] = useState(() =>
    columnsForWidth(typeof window === "undefined" ? 1600 : window.innerWidth)
  );
  useEffect(() => {
    const onResize = () => setCount(columnsForWidth(window.innerWidth));
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return count;
}

// Distribute photos round-robin across the columns so the sequence flows
// horizontally: items 1,2,3,4 sit at the top of columns 1..4 (read left→right),
// then wrap to the next row. The original index is preserved on each item so
// onOpen() still maps into the full, flat photos array the Lightbox uses.
export default function MasonryGrid({
  photos,
  onOpen,
  onToggleFavorite,
  onShare,
  onDelete,
  readOnly = false,
}) {
  const colCount = useColumnCount();
  const cols = Array.from({ length: colCount }, () => []);
  photos.forEach((photo, i) => cols[i % colCount].push({ photo, index: i }));

  return (
    <div className="masonry">
      {cols.map((items, c) => (
        <div className="masonry-col" key={c}>
          {items.map(({ photo, index }) => (
            <div
              key={photo.id}
              className="masonry-item"
              style={{ animationDelay: `${Math.min(index, 16) * 0.03}s` }}
            >
              <PhotoCard
                photo={photo}
                onOpen={() => onOpen(index)}
                onToggleFavorite={onToggleFavorite}
                onShare={onShare}
                onDelete={onDelete}
                readOnly={readOnly}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
