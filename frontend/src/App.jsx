import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Layout from "./components/Layout.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import { AuthProvider, useAuth } from "./auth/AuthContext.jsx";
import AllPhotos from "./pages/AllPhotos.jsx";
import Albums from "./pages/Albums.jsx";
import AlbumDetail from "./pages/AlbumDetail.jsx";
import Favorites from "./pages/Favorites.jsx";
import SharePage from "./pages/SharePage.jsx";
import Login from "./pages/Login.jsx";
import Account from "./pages/Account.jsx";
import Users from "./pages/Users.jsx";

function AppRoutes() {
  const location = useLocation();
  const { user } = useAuth();

  // Public share links render bare, with no session required.
  if (location.pathname.startsWith("/share/")) {
    return (
      <Routes location={location}>
        <Route path="/share/:token" element={<SharePage />} />
      </Routes>
    );
  }

  // Initial session check in flight.
  if (user === undefined) {
    return (
      <div className="auth-boot">
        <div className="spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes location={location}>
        <Route path="/login" element={<Login />} />
        <Route
          path="*"
          element={<Navigate to="/login" replace state={{ from: location.pathname }} />}
        />
      </Routes>
    );
  }

  return (
    <Layout>
      <AnimatePresence mode="wait">
        <Routes location={location} key={location.pathname}>
          <Route path="/" element={<AllPhotos />} />
          <Route path="/albums" element={<Albums />} />
          <Route path="/albums/:id" element={<AlbumDetail />} />
          <Route path="/favorites" element={<Favorites />} />
          <Route path="/account" element={<Account />} />
          {user.role === "admin" && <Route path="/users" element={<Users />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AnimatePresence>
    </Layout>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </ToastProvider>
  );
}
