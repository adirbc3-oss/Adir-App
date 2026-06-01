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

  const login = useCallback(async (correo, contrasena) => {
    setError(null);
    setLoading(true);
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api.php';
      const response = await fetch(`${apiUrl}?endpoint=auth&action=login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo, contrasena })
      });

      const text = await response.text();

      if (!text) {
        setError('Respuesta vacía del servidor');
        return false;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch (jsonErr) {
        console.error('Invalid JSON response:', text);
        setError('Error del servidor: ' + text.substring(0, 150));
        return false;
      }

      if (!response.ok || data.error) {
        const msg = data.error || 'Credenciales inválidas';
        setError(msg);
        return { ok: false, msg };
      }

      localStorage.setItem('adir_user', JSON.stringify(data.user));
      setUser(data.user);
      return { ok: true };
    } catch (err) {
      const msg = err.message || 'Error al conectar';
      setError(msg);
      return { ok: false, msg };
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
