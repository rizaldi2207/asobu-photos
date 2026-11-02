import { useState } from "react";
import { motion } from "framer-motion";
import { Auth } from "../api/client.js";
import { useAuth } from "../auth/AuthContext.jsx";
import { useToast } from "../components/Toast.jsx";
import "../components/gallery.css";
import "../components/modal.css";
import "./auth.css";

const pageMotion = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -10 },
  transition: { duration: 0.3 },
};

export default function Account() {
  const { user } = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (next !== confirm) {
      toast("New passwords do not match", "error");
      return;
    }
    setBusy(true);
    try {
      await Auth.changePassword(current, next);
      toast("Password updated — other devices were signed out", "success");
      setCurrent("");
      setNext("");
      setConfirm("");
    } catch (err) {
      toast(err?.response?.data?.error || "Could not update password", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div {...pageMotion}>
      <header className="page-head">
        <div>
          <span className="eyebrow">Signed in as</span>
          <h1 className="page-title">{user.username}</h1>
          <p className="page-sub">
            <span className="count-tag">{user.role}</span> account
          </p>
        </div>
      </header>

      <form className="panel glass" onSubmit={submit}>
        <h2 className="panel-title">Change password</h2>
        <div className="field">
          <label htmlFor="pw-current">Current password</label>
          <input
            id="pw-current"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="pw-new">New password (min. 8 characters)</label>
          <input
            id="pw-new"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="pw-confirm">Confirm new password</label>
          <input
            id="pw-confirm"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <div className="modal-actions">
          <button
            type="submit"
            className="btn btn-accent"
            disabled={busy || !current || !next || !confirm}
          >
            {busy ? "Saving…" : "Update password"}
          </button>
        </div>
      </form>
    </motion.div>
  );
}
