import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Share } from "../api/client.js";
import MasonryGrid from "../components/MasonryGrid.jsx";
import Lightbox from "../components/Lightbox.jsx";
import "../components/gallery.css";
import "./share.css";

export default function SharePage() {
  const { token } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState(null);

  useEffect(() => {
    Share.resolve(token)
      .then(setData)
      .catch((err) =>
        setError(err?.response?.data?.error || "This link is invalid or has expired.")
      )
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="share-wrap center-state">
        <div className="spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="share-wrap center-state">
        <div className="empty-art">🔗</div>
        <div className="empty-title">Link unavailable</div>
        <p>{error}</p>
        <a className="btn btn-accent" href="/">
          Go to Asobu Photos
        </a>
      </div>
    );
  }

  const photos = data.photos || [];

  return (
    <div className="share-wrap">
      <motion.header
        className="share-head"
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="share-brand">
          <span className="brand-mark">A</span>
          <span className="share-brand-name">Asobu Photos</span>
        </div>
        <span className="eyebrow">Shared {data.kind === "album" ? "album" : "gallery"}</span>
        <h1 className="page-title">{data.title}</h1>
        <p className="page-sub">
          <span className="count-tag">{photos.length}</span> photos · view & download
        </p>
      </motion.header>

      {photos.length === 0 ? (
        <div className="center-state">
          <div className="empty-art">🌫️</div>
          <div className="empty-title">Nothing here</div>
          <p>This share has no photos.</p>
        </div>
      ) : (
        <MasonryGrid photos={photos} onOpen={(i) => setLightbox(i)} readOnly />
      )}

      <Lightbox
        photos={photos}
        index={lightbox}
        onClose={() => setLightbox(null)}
        onNavigate={setLightbox}
        readOnly
      />

      <footer className="share-foot">
        Made with <span style={{ color: "var(--accent)" }}>Asobu Photos</span>
      </footer>
    </div>
  );
}
