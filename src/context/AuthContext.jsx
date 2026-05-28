import React, { createContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const savedUser = localStorage.getItem('adir_user');
    if (savedUser) {
      try {
        setUser(JSON.parse(savedUser));
      } catch (e) {
        localStorage.removeItem('adir_user');
      }
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (usuario, contraseña) => {
    setError(null);
    setLoading(true);
    try {
      const response = await fetch('/api/api.php?endpoint=auth&action=login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ usuario, contraseña })
      });

      const data = await response.json();

      if (!response.ok || data.error) {
        setError(data.error || 'Credenciales inválidas');
        return false;
      }

      localStorage.setItem('adir_user', JSON.stringify(data.user));
      setUser(data.user);
      return true;
    } catch (err) {
      setError(err.message || 'Error al conectar');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('adir_user');
    setUser(null);
    setError(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = React.useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return context;
};
