import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext(null);

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
    getMe();
  }, [getMe]);

  const login = async (email, password) => {
    const response = await authService.login(email, password);
    setUser(response.data);
    return response.data;
  };

  const register = async (email, nickName, password) => {
    const response = await authService.register(email, nickName, password);
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

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
