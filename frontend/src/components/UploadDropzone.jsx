import { useState, useCallback, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { motion, AnimatePresence } from "framer-motion";
import { Photos, Albums } from "../api/client.js";
import { useToast } from "./Toast.jsx";
import { IconUpload, IconClose, IconAlbums } from "./icons.jsx";
import "./modal.css";

// Keep each request comfortably under the proxy body limit by capping both the
// file count and the cumulative byte size of a batch.
const MAX_BATCH_FILES = 10;
const MAX_BATCH_BYTES = 40 * 1024 * 1024; // 40 MB

// Derive the relative path react-dropzone / the directory picker attaches to a file.
function relPath(file) {
  return (file.path || file.webkitRelativePath || file.name).replace(/^[./\\]+/, "");
}

// Split incoming files into per-top-level-folder groups (→ albums) and loose files.
function groupByFolder(files) {
  const folders = new Map();
  const loose = [];
  for (const file of files) {
    const type = file.type || "";
    if (!type.startsWith("image/") && !type.startsWith("video/")) continue;
    const parts = relPath(file).split("/");
    if (parts.length > 1) {
      const folder = parts[0];
      if (!folders.has(folder)) folders.set(folder, []);
      folders.get(folder).push(file);
    } else {
      loose.push(file);
    }
  }
  return { folders, loose };
}

// Greedily pack files into batches bounded by count and total size.
function makeBatches(files) {
  const batches = [];
  let current = [];
  let bytes = 0;
  for (const file of files) {
    if (
      current.length > 0 &&
      (current.length >= MAX_BATCH_FILES || bytes + file.size > MAX_BATCH_BYTES)
    ) {
      batches.push(current);
      current = [];
      bytes = 0;
    }
    current.push(file);
    bytes += file.size;
  }
  if (current.length) batches.push(current);
  return batches;
}

export default function UploadDropzone({ open, onClose }) {
  const toast = useToast();
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState("");
  const folderInputRef = useRef(null);

  const handleFiles = useCallback(
    async (incoming) => {
      const { folders, loose } = groupByFolder(incoming);
      if (folders.size === 0 && loose.length === 0) {
        toast("No images found", "error");
        return;
      }

      const total =
        loose.length + [...folders.values()].reduce((n, f) => n + f.length, 0);
      let done = 0;

      // Upload a set of files in bounded batches; optionally attach to an album.
      const uploadSet = async (files, albumId, label) => {
        let count = 0;
        for (const batch of makeBatches(files)) {
          setStatus(`${label} — ${done}/${total}`);
          const created = await Photos.upload(batch, (pct) => {
            const overall = ((done + (pct / 100) * batch.length) / total) * 100;
            setProgress(Math.round(overall));
          });
          if (albumId) await Albums.addPhotos(albumId, created.map((p) => p.id));
          done += batch.length;
          count += created.length;
          setProgress(Math.round((done / total) * 100));
        }
        return count;
      };

      setUploading(true);
      setProgress(0);
      try {
        let photoCount = 0;
        let albumCount = 0;

        // Each top-level folder becomes its own album, populated in batches.
        for (const [name, files] of folders) {
          const album = await Albums.create(name);
          const added = await uploadSet(files, album.id, `Album “${name}”`);
          if (added > 0) {
            albumCount++;
            photoCount += added;
          } else {
            // No image survived — clean up the empty album we just made.
            await Albums.remove(album.id);
          }
        }

        if (loose.length > 0) {
          photoCount += await uploadSet(loose, null, "Photos");
        }

        const bits = [];
        if (photoCount) bits.push(`${photoCount} photo${photoCount > 1 ? "s" : ""}`);
        if (albumCount) bits.push(`${albumCount} album${albumCount > 1 ? "s" : ""}`);
        toast(`Uploaded ${bits.join(" · ")} ✨`, "success");

        onClose();
        window.dispatchEvent(new CustomEvent("photos:changed"));
        window.dispatchEvent(new CustomEvent("albums:changed"));
      } catch (err) {
        toast(err?.response?.data?.error || "Upload failed", "error");
      } finally {
        setUploading(false);
        setProgress(0);
        setStatus("");
      }
    },
    [toast, onClose]
  );

  const onDrop = useCallback(
    (accepted) => {
      if (accepted.length > 0) handleFiles(accepted);
    },
    [handleFiles]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "image/*": [], "video/*": [] },
    disabled: uploading,
  });

  const onFolderPicked = (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = ""; // allow re-selecting the same folder later
    if (files.length > 0) handleFiles(files);
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
          >
            <button className="modal-x chip" onClick={onClose}>
              <IconClose width={18} height={18} />
            </button>
            <span className="eyebrow">Add to gallery</span>
            <h2 className="modal-title">Upload photos</h2>

            <div
              {...getRootProps()}
              className={`dropzone ${isDragActive ? "drag" : ""} ${uploading ? "busy" : ""}`}
            >
              <input {...getInputProps()} />
              {uploading ? (
                <div className="upload-progress">
                  <div className="spin" />
                  <span>{status || `Uploading… ${progress}%`}</span>
                  <div className="bar">
                    <motion.div
                      className="bar-fill"
                      animate={{ width: `${progress}%` }}
                      transition={{ ease: "easeOut" }}
                    />
                  </div>
                </div>
              ) : (
                <>
                  <motion.div animate={{ y: isDragActive ? -6 : 0 }} className="drop-icon">
                    <IconUpload width={34} height={34} />
                  </motion.div>
                  <p className="drop-main">
                    {isDragActive ? "Drop them here" : "Drag & drop photos, videos or a folder"}
                  </p>
                  <p className="drop-sub">
                    or click to browse — a dropped folder becomes an album
                  </p>
                </>
              )}
            </div>

            {!uploading && (
              <>
                <div className="upload-or">
                  <span>or</span>
                </div>
                {/* webkitdirectory lets the user pick a whole folder → one album */}
                <input
                  ref={folderInputRef}
                  type="file"
                  webkitdirectory=""
                  directory=""
                  multiple
                  hidden
                  onChange={onFolderPicked}
                />
                <button
                  className="btn folder-btn"
                  onClick={() => folderInputRef.current?.click()}
                >
                  <IconAlbums width={18} height={18} />
                  Choose a folder to upload as an album
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
