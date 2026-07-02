import { useEffect, useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Albums as AlbumsApi } from "../api/client.js";
import { useToast } from "../components/Toast.jsx";
import { IconPlus, IconAlbums, IconClose } from "../components/icons.jsx";
import "../components/modal.css";
import "./albums.css";

const pageMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.3 },
};

export default function Albums() {
  const toast = useToast();
  const [albums, setAlbums] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    AlbumsApi.list()
      .then(setAlbums)
      .catch(() => toast("Could not load albums", "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener("albums:changed", onChange);
    return () => window.removeEventListener("albums:changed", onChange);
  }, [load]);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const album = await AlbumsApi.create(name.trim(), description.trim());
      setAlbums((a) => [album, ...a]);
      toast("Album created", "success");
      setCreating(false);
      setName("");
      setDescription("");
    } catch (err) {
      toast(err?.response?.data?.error || "Could not create album", "error");
    }
  };

  return (
    <motion.div {...pageMotion}>
      <header className="page-head">
        <div>
          <span className="eyebrow">Collections</span>
          <h1 className="page-title">Albums</h1>
          <p className="page-sub">
            <span className="count-tag">{albums.length}</span> albums organized
          </p>
        </div>
        <button className="btn btn-accent" onClick={() => setCreating(true)}>
          <IconPlus width={18} height={18} />
          New album
        </button>
      </header>

      {loading ? (
        <div className="center-state">
          <div className="spin" />
        </div>
      ) : albums.length === 0 ? (
        <div className="center-state">
          <div className="empty-art">📂</div>
          <div className="empty-title">No albums yet</div>
          <p>Create an album to group your photos.</p>
        </div>
      ) : (
        <div className="album-grid">
          {albums.map((album, i) => (
            <motion.div
              key={album.id}
              initial={{ opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: i * 0.05, type: "spring", stiffness: 260, damping: 24 }}
            >
              <Link to={`/albums/${album.id}`} className="album-card">
                <div className="album-cover">
                  {album.coverThumbUrl ? (
                    <img src={album.coverThumbUrl} alt={album.name} loading="lazy" />
                  ) : (
                    <div className="album-cover-empty">
                      <IconAlbums width={34} height={34} />
                    </div>
                  )}
                  <span className="album-count">{album.photoCount} photos</span>
                </div>
                <div className="album-meta">
                  <h3>{album.name}</h3>
                  {album.description && <p>{album.description}</p>}
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {creating && (
          <motion.div
            className="modal-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setCreating(false)}
          >
            <motion.form
              className="modal glass"
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.97 }}
              transition={{ type: "spring", stiffness: 280, damping: 26 }}
              onClick={(e) => e.stopPropagation()}
              onSubmit={create}
            >
              <button
                type="button"
                className="modal-x chip"
                onClick={() => setCreating(false)}
              >
                <IconClose width={18} height={18} />
              </button>
              <span className="eyebrow">New collection</span>
              <h2 className="modal-title">Create album</h2>
              <div className="field">
                <label>Name</label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Summer 2026"
                />
              </div>
              <div className="field">
                <label>Description (optional)</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A few words about this album…"
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setCreating(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-accent">
                  Create album
                </button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
