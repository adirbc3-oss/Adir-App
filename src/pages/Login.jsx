import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { AlertCircle } from 'lucide-react';
import logoAdir from '../assets/adirblanco-header.webp';

const Login = () => {
  const { login, loading, error } = useAuth();
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [localError, setLocalError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');

    if (!correo.trim() || !contrasena.trim()) {
      setLocalError('Correo y contraseña requeridos');
      return;
    }

    const success = await login(correo, contrasena);
    if (!success) {
      setLocalError(error || 'Error al iniciar sesión');
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)',
      fontFamily: "'Segoe UI', Tahoma, Geneva, Verdana, sans-serif"
    }}>
      <div style={{
        background: 'white',
        borderRadius: '12px',
        padding: '48px 40px',
        boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
        width: '100%',
        maxWidth: '420px'
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src={logoAdir} alt="ADIR Logo" style={{ height: 60, marginBottom: 8 }} />
          <h1 style={{ fontSize: '24px', fontWeight: 700, color: '#1e293b', margin: '8px 0 4px' }}>
            ADIR
          </h1>
          <p style={{ fontSize: '13px', color: '#64748b', margin: 0 }}>
            Inserta tu usuario y contraseña
          </p>
        </div>

        {/* Formulario */}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Error Message */}
          {(localError || error) && (
            <div style={{
              background: '#fee2e2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              padding: '12px 16px',
              display: 'flex',
              gap: 12,
              alignItems: 'flex-start',
              color: '#b91c1c',
              fontSize: '13px'
            }}>
              <AlertCircle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
              <span>{localError || error}</span>
            </div>
          )}

          {/* Correo Input */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 600,
              color: '#475569',
              marginBottom: 8
            }}>
              Correo
            </label>
            <input
              type="email"
              value={correo}
              onChange={(e) => setCorreo(e.target.value)}
              placeholder="correo@ejemplo.com"
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                fontSize: '14px',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
                outline: 'none'
              }}
              onFocus={(e) => e.target.style.borderColor = '#0ea5e9'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              disabled={loading}
            />
          </div>

          {/* Contraseña Input */}
          <div>
            <label style={{
              display: 'block',
              fontSize: '13px',
              fontWeight: 600,
              color: '#475569',
              marginBottom: 8
            }}>
              Contraseña
            </label>
            <input
              type="password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                fontSize: '14px',
                boxSizing: 'border-box',
                transition: 'border-color 0.2s',
                outline: 'none'
              }}
              onFocus={(e) => e.target.style.borderColor = '#0ea5e9'}
              onBlur={(e) => e.target.style.borderColor = '#e2e8f0'}
              disabled={loading}
            />
          </div>

          {/* Botón Login */}
          <button
            type="submit"
            disabled={loading}
            style={{
              background: loading ? '#cbd5e1' : 'linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%)',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              padding: '12px 24px',
              fontSize: '15px',
              fontWeight: 600,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s',
              marginTop: 8
            }}
            onMouseEnter={(e) => !loading && (e.target.style.transform = 'translateY(-2px)')}
            onMouseLeave={(e) => !loading && (e.target.style.transform = 'translateY(0)')}
          >
            {loading ? 'Autenticando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
