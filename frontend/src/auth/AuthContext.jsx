import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Auth } from "../api/client.js";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

// Holds the signed-in user. `user` is undefined while the initial session check
// runs, null when signed out, and the user object when signed in.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined);

  useEffect(() => {
    Auth.me()
      .then(setUser)
      .catch(() => setUser(null));
    const onUnauthorized = () => setUser(null);
    window.addEventListener("auth:unauthorized", onUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", onUnauthorized);
  }, []);

  const login = useCallback(async (username, password) => {
    const u = await Auth.login(username, password);
    setUser(u);
    return u;
  }, []);

  const logout = useCallback(async () => {
    try {
      await Auth.logout();
    } finally {
      setUser(null);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
  );
}
