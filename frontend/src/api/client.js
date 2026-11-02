import axios from "axios";

const api = axios.create({ baseURL: "/api", withCredentials: true });

// Any 401 from a protected endpoint means the session is gone — let the
// AuthProvider drop the user and show the login screen.
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const url = err?.config?.url || "";
    if (err?.response?.status === 401 && !url.startsWith("/auth/")) {
      window.dispatchEvent(new Event("auth:unauthorized"));
    }
    return Promise.reject(err);
  }
);

export const Auth = {
  me: () => api.get("/auth/me").then((r) => r.data),
  login: (username, password) =>
    api.post("/auth/login", { username, password }).then((r) => r.data),
  logout: () => api.post("/auth/logout"),
  changePassword: (currentPassword, newPassword) =>
    api.post("/auth/password", { currentPassword, newPassword }),
};

export const Users = {
  list: () => api.get("/users").then((r) => r.data),
  create: (username, password, role) =>
    api.post("/users", { username, password, role }).then((r) => r.data),
  update: (id, patch) => api.patch(`/users/${id}`, patch).then((r) => r.data),
  remove: (id) => api.delete(`/users/${id}`),
};

export const Photos = {
  list: (params) => api.get("/photos", { params }).then((r) => r.data),
  get: (id) => api.get(`/photos/${id}`).then((r) => r.data),
  favorites: () => api.get("/favorites").then((r) => r.data),
  toggleFavorite: (id) => api.patch(`/photos/${id}/favorite`).then((r) => r.data),
  remove: (id) => api.delete(`/photos/${id}`),
  upload: (files, onProgress) => {
    const form = new FormData();
    for (const f of files) form.append("photos", f);
    return api
      .post("/photos", form, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e) => {
          if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100));
        },
      })
      .then((r) => r.data);
  },
};

export const Albums = {
  list: () => api.get("/albums").then((r) => r.data),
  get: (id) => api.get(`/albums/${id}`).then((r) => r.data),
  listPhotos: (id, params) =>
    api.get(`/albums/${id}/photos`, { params }).then((r) => r.data),
  create: (name, description) =>
    api.post("/albums", { name, description }).then((r) => r.data),
  remove: (id) => api.delete(`/albums/${id}`),
  addPhotos: (id, photoIds) =>
    api.post(`/albums/${id}/photos`, { photoIds }).then((r) => r.data),
  removePhoto: (id, photoId) => api.delete(`/albums/${id}/photos/${photoId}`),
};

export const Share = {
  create: (kind, targetId) =>
    api.post("/share", { kind, targetId }).then((r) => r.data),
  resolve: (token) => api.get(`/share/${token}`).then((r) => r.data),
};

export default api;
