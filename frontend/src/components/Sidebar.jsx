import { NavLink } from "react-router-dom";
import { motion } from "framer-motion";
import {
  IconPhotos,
  IconAlbums,
  IconHeart,
  IconUpload,
  IconUsers,
  IconUser,
  IconLogout,
} from "./icons.jsx";
import { useAuth } from "../auth/AuthContext.jsx";

const nav = [
  { to: "/", label: "All Photos", Icon: IconPhotos, end: true },
  { to: "/albums", label: "Albums", Icon: IconAlbums },
  { to: "/favorites", label: "Favorites", Icon: IconHeart },
];

const adminNav = [{ to: "/users", label: "Users", Icon: IconUsers }];

export default function Sidebar({ onUpload }) {
  const { user, logout } = useAuth();
  const items = user?.role === "admin" ? [...nav, ...adminNav] : nav;

  return (
    <aside className="sidebar glass">
      <div className="brand">
        <span className="brand-mark">A</span>
        <div>
          <div className="brand-name">Asobu</div>
          <div className="brand-sub">photos</div>
        </div>
      </div>

      <nav className="nav">
        {items.map(({ to, label, Icon, end }, i) => (
          <motion.div
            key={to}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.05 * i + 0.1 }}
          >
            <NavLink to={to} end={end} className="nav-link">
              {({ isActive }) => (
                <>
                  {isActive && (
                    <motion.span
                      layoutId="nav-pill"
                      className="nav-pill"
                      transition={{ type: "spring", stiffness: 480, damping: 36 }}
                    />
                  )}
                  <Icon className="nav-icon" />
                  <span>{label}</span>
                </>
              )}
            </NavLink>
          </motion.div>
        ))}
      </nav>

      <button className="btn btn-accent upload-btn" onClick={onUpload}>
        <IconUpload width={18} height={18} />
        Upload
      </button>

      <div className="sidebar-user">
        <NavLink to="/account" className="sidebar-user-link" title="Account settings">
          <IconUser width={18} height={18} />
          <span>{user?.username}</span>
        </NavLink>
        <button className="chip" title="Sign out" onClick={logout}>
          <IconLogout width={17} height={17} />
        </button>
      </div>
    </aside>
  );
}
