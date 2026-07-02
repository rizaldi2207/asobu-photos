import { Routes, Route, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import Layout from "./components/Layout.jsx";
import { ToastProvider } from "./components/Toast.jsx";
import AllPhotos from "./pages/AllPhotos.jsx";
import Albums from "./pages/Albums.jsx";
import AlbumDetail from "./pages/AlbumDetail.jsx";
import Favorites from "./pages/Favorites.jsx";
import SharePage from "./pages/SharePage.jsx";

export default function App() {
  const location = useLocation();
  const isShare = location.pathname.startsWith("/share/");

  return (
    <ToastProvider>
      {isShare ? (
        <Routes location={location}>
          <Route path="/share/:token" element={<SharePage />} />
        </Routes>
      ) : (
        <Layout>
          <AnimatePresence mode="wait">
            <Routes location={location} key={location.pathname}>
              <Route path="/" element={<AllPhotos />} />
              <Route path="/albums" element={<Albums />} />
              <Route path="/albums/:id" element={<AlbumDetail />} />
              <Route path="/favorites" element={<Favorites />} />
            </Routes>
          </AnimatePresence>
        </Layout>
      )}
    </ToastProvider>
  );
}
