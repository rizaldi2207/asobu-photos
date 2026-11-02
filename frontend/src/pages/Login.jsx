import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { useAuth } from "../auth/AuthContext.jsx";
import "../components/modal.css";
import "./auth.css";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!username || !password) return;
    setBusy(true);
    setError(null);
    try {
      await login(username.trim(), password);
      const from = location.state?.from;
      navigate(from && from !== "/login" ? from : "/", { replace: true });
    } catch (err) {
      setError(err?.response?.data?.error || "Could not sign in");
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <motion.form
        className="auth-card glass"
        onSubmit={submit}
        initial={{ opacity: 0, y: 24, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
      >
        <div className="brand auth-brand">
          <span className="brand-mark">A</span>
          <div>
            <div className="brand-name">Asobu</div>
            <div className="brand-sub">photos</div>
          </div>
        </div>

        <span className="eyebrow">Welcome back</span>
        <h1 className="modal-title">Sign in</h1>

        <div className="field">
          <label htmlFor="login-username">Username</label>
          <input
            id="login-username"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error && <p className="auth-error">{error}</p>}

        <button type="submit" className="btn btn-accent auth-submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </motion.form>
    </div>
  );
}
