import { createContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/api';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Verify existing session on mount (cookie-based JWT)
  const getMe = useCallback(async () => {
    try {
      const response = await authService.getMe();
      setUser(response.data);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initial session check
    getMe();
  }, [getMe]);

  const login = async (email, password) => {
    const response = await authService.login(email, password);
    setUser(response.data);
    return response.data;
  };

  const register = async (email, nickName, password, inviteToken) => {
    const payload = { email, nickName, password };
    if (inviteToken) {
      payload.inviteToken = inviteToken;
    }
    const response = await authService.register(payload);
    setUser(response.data);
    return response.data;
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
