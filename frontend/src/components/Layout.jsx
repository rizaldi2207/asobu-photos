import { useState } from "react";
import Sidebar from "./Sidebar.jsx";
import UploadDropzone from "./UploadDropzone.jsx";
import "./layout.css";

export default function Layout({ children }) {
  const [uploadOpen, setUploadOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar onUpload={() => setUploadOpen(true)} />
      <main className="app-main">{children}</main>
      <UploadDropzone open={uploadOpen} onClose={() => setUploadOpen(false)} />
    </div>
  );
}
