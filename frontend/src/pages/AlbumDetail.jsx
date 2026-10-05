import { useEffect, useState, useCallback, useRef } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Albums as AlbumsApi, Photos } from "../api/client.js";
import { useToast } from "../components/Toast.jsx";
import MasonryGrid from "../components/MasonryGrid.jsx";
import Lightbox from "../components/Lightbox.jsx";
import ShareModal from "../components/ShareModal.jsx";
import PhotoPicker from "../components/PhotoPicker.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import SortControl from "../components/SortControl.jsx";
import { IconChevronLeft, IconPlus, IconShare, IconTrash, IconClose } from "../components/icons.jsx";
import "./albums.css";

const PAGE = 60;

const pageMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.3 },
};

export default function AlbumDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [album, setAlbum] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [lightbox, setLightbox] = useState(null);
  const [shareTarget, setShareTarget] = useState(null);
  const [picker, setPicker] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmAlbum, setConfirmAlbum] = useState(false);
  const [deletingAlbum, setDeletingAlbum] = useState(false);
  const [sort, setSort] = useState("date");
  const [order, setOrder] = useState("desc");

  const offsetRef = useRef(0);
  const loadingRef = useRef(false);
  const sentinelRef = useRef(null);

  const loadMeta = useCallback(() => {
    AlbumsApi.get(id)
      .then(setAlbum)
      .catch(() => toast("Could not load album", "error"));
  }, [id, toast]);

  // Fetch one page of album photos. `reset` reloads from the top.
  const fetchPage = useCallback(
    async (reset) => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      const offset = reset ? 0 : offsetRef.current;
      reset ? setLoading(true) : setLoadingMore(true);
      try {
        const batch = await AlbumsApi.listPhotos(id, { limit: PAGE, offset, sort, order });
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
    [id, toast, sort, order]
  );

  useEffect(() => {
    loadMeta();
    fetchPage(true);
  }, [loadMeta, fetchPage]);

  // Infinite scroll
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

  const addSelected = async (ids) => {
    if (!ids || ids.length === 0) return;
    await AlbumsApi.addPhotos(id, ids);
    setPicker(false);
    toast(`Added ${ids.length} photo${ids.length > 1 ? "s" : ""}`, "success");
    loadMeta();
    fetchPage(true);
  };

  const removeFromAlbum = async (photo) => {
    await AlbumsApi.removePhoto(id, photo.id);
    setPhotos((ps) => ps.filter((p) => p.id !== photo.id));
    offsetRef.current = Math.max(0, offsetRef.current - 1);
    setAlbum((a) => (a ? { ...a, photoCount: Math.max(0, a.photoCount - 1) } : a));
    toast("Removed from album", "success");
  };

  // Permanently delete the media itself (removes it from the library and storage,
  // not just from this album). Triggered from the Lightbox via a confirm dialog.
  // Keeps the lightbox on a valid neighbour, or closes it when the album empties.
  const confirmDeletePhoto = async () => {
    const photo = pendingDelete;
    if (!photo) return;
    setDeleting(true);
    try {
      await Photos.remove(photo.id);
      const remaining = photos.filter((p) => p.id !== photo.id);
      setPhotos(remaining);
      offsetRef.current = Math.max(0, offsetRef.current - 1);
      setAlbum((a) => (a ? { ...a, photoCount: Math.max(0, a.photoCount - 1) } : a));
      setLightbox((idx) =>
        idx == null ? idx : remaining.length === 0 ? null : Math.min(idx, remaining.length - 1)
      );
      toast("Photo deleted", "success");
      setPendingDelete(null);
    } catch {
      toast("Could not delete photo", "error");
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeleteAlbum = async () => {
    setDeletingAlbum(true);
    try {
      await AlbumsApi.remove(id);
      toast("Album deleted", "success");
      navigate("/albums");
    } catch {
      toast("Could not delete album", "error");
      setDeletingAlbum(false);
      setConfirmAlbum(false);
    }
  };

  const toggleFavorite = async (photo) => {
    const updated = await Photos.toggleFavorite(photo.id);
    setPhotos((ps) => ps.map((p) => (p.id === updated.id ? updated : p)));
  };

  if (loading && !album) {
    return (
      <div className="center-state">
        <div className="spin" />
      </div>
    );
  }
  if (!album) return null;

  return (
    <motion.div {...pageMotion}>
      <div className="detail-top">
        <Link to="/albums" className="back-link">
          <IconChevronLeft width={18} height={18} /> Albums
        </Link>
      </div>

      <header className="page-head">
        <div>
          <span className="eyebrow">Album</span>
          <h1 className="page-title">{album.name}</h1>
          <p className="page-sub">
            {album.description ? `${album.description} · ` : ""}
            <span className="count-tag">{album.photoCount}</span> photos
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
          <button className="btn btn-accent" onClick={() => setPicker(true)}>
            <IconPlus width={17} height={17} /> Add photos
          </button>
          <button
            className="btn"
            onClick={() =>
              setShareTarget({ kind: "album", id: album.id, label: album.name })
            }
          >
            <IconShare width={17} height={17} /> Share
          </button>
          <button className="btn" onClick={() => setConfirmAlbum(true)}>
            <IconTrash width={17} height={17} /> Delete
          </button>
        </div>
      </header>

      {album.photoCount === 0 ? (
        <div className="center-state">
          <div className="empty-art">🌅</div>
          <div className="empty-title">This album is empty</div>
          <p>Add some photos to bring it to life.</p>
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
            onDelete={removeFromAlbum}
            deleteLabel="Remove from album"
            deleteIcon={IconClose}
          />
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
        onDelete={setPendingDelete}
      />
      <ShareModal target={shareTarget} onClose={() => setShareTarget(null)} />

      <ConfirmDialog
        open={!!pendingDelete}
        danger
        title="Delete permanently?"
        message={
          pendingDelete
            ? `"${pendingDelete.originalName}" will be removed from your library and storage. This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={confirmDeletePhoto}
        onCancel={() => setPendingDelete(null)}
      />

      <ConfirmDialog
        open={confirmAlbum}
        danger
        title="Delete album?"
        message={
          album
            ? `"${album.name}" will be deleted. Your photos stay in your library.`
            : ""
        }
        confirmLabel="Delete album"
        busy={deletingAlbum}
        onConfirm={confirmDeleteAlbum}
        onCancel={() => setConfirmAlbum(false)}
      />

      <PhotoPicker
        open={picker}
        albumId={id}
        onClose={() => setPicker(false)}
        onConfirm={addSelected}
      />
    </motion.div>
  );
}
