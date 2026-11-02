import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Users as UsersApi } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useToast } from "../components/Toast.jsx";
import ConfirmDialog from "../components/ConfirmDialog.jsx";
import { IconPlus, IconClose, IconTrash, IconLock } from "../components/icons.jsx";
import "../components/gallery.css";
import "../components/modal.css";
import "./auth.css";

const pageMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.3 },
};

function Modal({ open, onClose, onSubmit, eyebrow, title, children, submitLabel, busy }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="modal-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={busy ? undefined : onClose}
        >
          <motion.form
            className="modal glass"
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            onClick={(e) => e.stopPropagation()}
            onSubmit={onSubmit}
          >
            <button type="button" className="modal-x chip" onClick={onClose}>
              <IconClose width={18} height={18} />
            </button>
            <span className="eyebrow">{eyebrow}</span>
            <h2 className="modal-title">{title}</h2>
            {children}
            <div className="modal-actions">
              <button type="button" className="btn" onClick={onClose} disabled={busy}>
                Cancel
              </button>
              <button type="submit" className="btn btn-accent" disabled={busy}>
                {busy ? "…" : submitLabel}
              </button>
            </div>
          </motion.form>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function Users() {
  const { user: me } = useAuth();
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ username: "", password: "", role: "user" });
  const [resetting, setResetting] = useState(null); // user
  const [resetPw, setResetPw] = useState("");
  const [deleting, setDeleting] = useState(null); // user

  const load = useCallback(() => {
    setLoading(true);
    UsersApi.list()
      .then(setUsers)
      .catch(() => toast("Could not load users", "error"))
      .finally(() => setLoading(false));
  }, [toast]);

  useEffect(load, [load]);

  const errMsg = (err, fallback) => err?.response?.data?.error || fallback;

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const u = await UsersApi.create(form.username.trim(), form.password, form.role);
      setUsers((list) => [...list, u]);
      toast(`User "${u.username}" created`, "success");
      setCreating(false);
      setForm({ username: "", password: "", role: "user" });
    } catch (err) {
      toast(errMsg(err, "Could not create user"), "error");
    } finally {
      setBusy(false);
    }
  };

  const changeRole = async (u, role) => {
    try {
      const updated = await UsersApi.update(u.id, { role });
      setUsers((list) => list.map((x) => (x.id === u.id ? updated : x)));
      toast(`${u.username} is now ${role}`, "success");
    } catch (err) {
      toast(errMsg(err, "Could not change role"), "error");
    }
  };

  const resetPassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await UsersApi.update(resetting.id, { password: resetPw });
      toast(`Password for "${resetting.username}" reset`, "success");
      setResetting(null);
      setResetPw("");
    } catch (err) {
      toast(errMsg(err, "Could not reset password"), "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await UsersApi.remove(deleting.id);
      setUsers((list) => list.filter((x) => x.id !== deleting.id));
      toast(`User "${deleting.username}" deleted`, "success");
      setDeleting(null);
    } catch (err) {
      toast(errMsg(err, "Could not delete user"), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div {...pageMotion}>
      <header className="page-head">
        <div>
          <span className="eyebrow">Administration</span>
          <h1 className="page-title">Users</h1>
          <p className="page-sub">
            <span className="count-tag">{users.length}</span> accounts · each user sees only
            their own photos & albums
          </p>
        </div>
        <button className="btn btn-accent" onClick={() => setCreating(true)}>
          <IconPlus width={18} height={18} />
          New user
        </button>
      </header>

      {loading ? (
        <div className="center-state">
          <div className="spin" />
        </div>
      ) : (
        <div className="user-list">
          {users.map((u) => {
            const isMe = u.id === me.id;
            return (
              <div key={u.id} className="user-row glass">
                <div className="user-avatar">{u.username.slice(0, 1).toUpperCase()}</div>
                <div className="user-info">
                  <div className="user-name">
                    {u.username}
                    {isMe && <span className="user-you">you</span>}
                  </div>
                  <div className="user-meta">
                    {u.photoCount} photos · joined {new Date(u.createdAt).toLocaleDateString()}
                  </div>
                </div>
                <select
                  className="user-role"
                  value={u.role}
                  disabled={isMe}
                  title={isMe ? "You cannot change your own role" : "Role"}
                  onChange={(e) => changeRole(u, e.target.value)}
                >
                  <option value="user">user</option>
                  <option value="admin">admin</option>
                </select>
                <button
                  className="chip"
                  title="Reset password"
                  onClick={() => {
                    setResetPw("");
                    setResetting(u);
                  }}
                >
                  <IconLock width={17} height={17} />
                </button>
                <button
                  className="chip chip-danger"
                  title={isMe ? "You cannot delete yourself" : "Delete user"}
                  disabled={isMe}
                  onClick={() => setDeleting(u)}
                >
                  <IconTrash width={17} height={17} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        onSubmit={create}
        eyebrow="New account"
        title="Create user"
        submitLabel="Create user"
        busy={busy}
      >
        <div className="field">
          <label htmlFor="nu-username">Username</label>
          <input
            id="nu-username"
            autoFocus
            autoComplete="off"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            placeholder="3–32 chars: letters, digits, . _ -"
          />
        </div>
        <div className="field">
          <label htmlFor="nu-password">Password</label>
          <input
            id="nu-password"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            placeholder="At least 8 characters"
          />
        </div>
        <div className="field">
          <label htmlFor="nu-role">Role</label>
          <select
            id="nu-role"
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value })}
          >
            <option value="user">user — own photos & albums</option>
            <option value="admin">admin — also manages users</option>
          </select>
        </div>
      </Modal>

      <Modal
        open={!!resetting}
        onClose={() => setResetting(null)}
        onSubmit={resetPassword}
        eyebrow="Reset password"
        title={resetting?.username || ""}
        submitLabel="Set password"
        busy={busy}
      >
        <p className="modal-desc">The user will be signed out of all devices.</p>
        <div className="field">
          <label htmlFor="rp-password">New password</label>
          <input
            id="rp-password"
            type="password"
            autoFocus
            autoComplete="new-password"
            value={resetPw}
            onChange={(e) => setResetPw(e.target.value)}
            placeholder="At least 8 characters"
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleting}
        danger
        busy={busy}
        title={`Delete "${deleting?.username}"?`}
        message={`This permanently deletes the account and all of its ${deleting?.photoCount ?? 0} photos, albums and share links.`}
        confirmLabel="Delete user"
        onConfirm={remove}
        onCancel={() => setDeleting(null)}
      />
    </motion.div>
  );
}
