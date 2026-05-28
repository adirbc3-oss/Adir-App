import React, { useState, useEffect } from 'react';
import { HashRouter as Router, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { FileUp, Files, Users, Settings, BarChart2, Mailbox, HardHat, Database, History, FileCheck, LayoutDashboard, FileSignature, Building2, LogOut } from 'lucide-react';
import { supabase } from './utils/supabaseClient';
import { AuthProvider, useAuth } from './context/AuthContext';

import NuevoProyecto from './pages/NuevoProyecto';
import Borradores from './pages/Borradores';
import BandejaEntrada from './pages/BandejaEntrada';
import Proveedores from './pages/Proveedores';
import Ajustes from './pages/Ajustes';
import Portal from './pages/Portal';
import PresupuestoCliente from './pages/PresupuestoCliente';
import Comparativa from './pages/Comparativa';
import JefesObra from './pages/JefesObra';
import Proyectos from './pages/Proyectos';
import BasePrecios from './pages/BasePrecios';
import Historial from './pages/Historial';
import PresupuestosFirmados from './pages/PresupuestosFirmados';
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import Login from './pages/Login';
import Usuarios from './pages/Usuarios';

import logoAdir from './assets/adirblanco-header.webp';

const NavBadge = ({ count }) => {
  if (!count || count === 0) return null;
  return (
    <span style={{
      marginLeft: 'auto',
      backgroundColor: '#ef4444',
      color: 'white',
      fontSize: '0.65rem',
      fontWeight: 800,
      minWidth: '18px',
      height: '18px',
      borderRadius: '9px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '0 5px',
      lineHeight: 1,
      boxShadow: '0 2px 6px rgba(239,68,68,0.5)',
      animation: 'pulseBadge 2s ease-in-out infinite'
    }}>
      {count > 99 ? '99+' : count}
    </span>
  );
};

const Sidebar = ({ counts = {}, user }) => {
  const { logout } = useAuth();
  return (
    <div className="sidebar">
      <div className="sidebar-header animate-fade-in">
        <img src={logoAdir} alt="ADIR Logo" className="sidebar-logo" />
      </div>
      <div className="sidebar-nav">
        <NavLink to="/dashboard" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <LayoutDashboard size={20} />Panel de Control
        </NavLink>
        <NavLink to="/nuevo" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <FileUp size={20} />Procesar BC3
        </NavLink>
        <NavLink to="/borradores" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <Files size={20} />Borradores en Curso<NavBadge count={counts.borradores} />
        </NavLink>
        <NavLink to="/bandeja" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <Mailbox size={20} />Buzón Entrada<NavBadge count={counts.bandeja} />
        </NavLink>
        {user?.tipo_usuario === 3 && (
          <NavLink to="/jefes-obra" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
            <HardHat size={20} />Jefes de Obra<NavBadge count={counts.jefes} />
          </NavLink>
        )}
        <NavLink to="/proyectos" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <Files size={20} />Obras y Proyectos
        </NavLink>
        <NavLink to="/clientes" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <Building2 size={20} />Clientes
        </NavLink>
        <NavLink to="/proveedores" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <Users size={20} />Proveedores
        </NavLink>
        <NavLink to="/comparativa" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <BarChart2 size={20} />Comparativa
        </NavLink>
        <NavLink to="/presupuestos-firmados" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <FileSignature size={20} />Presupuestos Firmados
        </NavLink>
        <NavLink to="/base-precios" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <Database size={20} />Base Precios
        </NavLink>
        <NavLink to="/historial" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <History size={20} />Historial
        </NavLink>
        {(user?.tipo_usuario === 1 || user?.tipo_usuario === 2) && (
          <NavLink to="/usuarios" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
            <Users size={20} />Usuarios
          </NavLink>
        )}
        <NavLink to="/ajustes" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <Settings size={20} />Ajustes
        </NavLink>
      </div>
      <div className="sidebar-footer">
        <div style={{ fontSize: '12px', color: '#50504d', marginBottom: 8, fontWeight: 600 }}>
          {user?.nombre} {user?.apellido}
        </div>
        <button onClick={logout} style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          padding: '10px 12px',
          background: '#002D54',
          color: 'white',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: '13px',
          fontWeight: 600
        }}>
          <LogOut size={18} />
          Cerrar Sesión
        </button>
      </div>
    </div>
  );
};

const AppContent = () => {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [sessionCache, setSessionCache] = React.useState({});
  const [notification, setNotification] = useState(null);
  const [sidebarCounts, setSidebarCounts] = useState({ borradores: 0, bandeja: 0, jefes: 0 });

  const isPortalPath = location.pathname.startsWith('/portal') || location.pathname.startsWith('/presupuesto-cliente');
  const isLoginPath = location.pathname.startsWith('/login');
  const isUsuariosPath = location.pathname.startsWith('/usuarios');

  const fetchCounts = React.useCallback(async () => {
    try {
      const [r1, r2, r3] = await Promise.all([
        supabase.from('propuestas').select('*', { count: 'exact', head: true }).eq('estado', 'Borrador'),
        supabase.from('propuestas').select('*', { count: 'exact', head: true }).eq('estado', 'Pendiente'),
        supabase.from('propuestas').select('*', { count: 'exact', head: true }).eq('estado', 'En Revisión'),
      ]);
      setSidebarCounts({ borradores: r1.count || 0, bandeja: r2.count || 0, jefes: r3.count || 0 });
    } catch (e) { console.warn('Error fetching sidebar counts:', e); }
  }, []);

  useEffect(() => {
    if (user) {
      fetchCounts();
      const interval = setInterval(fetchCounts, 30000);
      return () => clearInterval(interval);
    }
  }, [fetchCounts, user]);

  useEffect(() => {
    if (!user) {
      const channel = supabase
        .channel('presupuestos_firmados_realtime')
        .on('postgres_changes', {
          event: 'UPDATE',
          schema: 'public',
          table: 'presupuestos_cliente',
          filter: 'estado=eq.firmado'
        }, (payload) => {
          const p = payload.new;
          setNotification({
            msg: `✅ ${p.cliente_nombre || 'Un cliente'} ha firmado el presupuesto del proyecto ${p.propuesta_id}`,
            type: 'success',
            id: p.id
          });
          setTimeout(() => setNotification(null), 8000);
          fetchCounts();
        })
        .subscribe();
      return () => supabase.removeChannel(channel);
    }
  }, [fetchCounts, user]);

  if (loading) {
    return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>Cargando...</div>;
  }

  // Portal routes (sin autenticación requerida)
  if (isPortalPath) {
    return (
      <Routes>
        <Route path="/portal" element={<Portal />} />
        <Route path="/presupuesto-cliente" element={<PresupuestoCliente />} />
      </Routes>
    );
  }

  // Si no hay usuario autenticado, mostrar login
  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  // Usuarios solo para admin/administración
  if (isUsuariosPath && user.tipo_usuario !== 1 && user.tipo_usuario !== 2) {
    return <Navigate to="/dashboard" replace />;
  }

  // Jefes de obra solo para Jefe de Obra
  if (location.pathname.startsWith('/jefes-obra') && user.tipo_usuario !== 3) {
    return <Navigate to="/dashboard" replace />;
  }

  const toastBg = 'linear-gradient(135deg, #15803d, #16a34a)';
  const toastShadow = '0 8px 32px rgba(22,163,74,0.4)';

  return (
    <div className="app-container">
      <Sidebar counts={sidebarCounts} user={user} />
      <main className="main-content">
        {notification && (
          <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
            background: toastBg,
            color: 'white', padding: '16px 24px', borderRadius: 14,
            boxShadow: toastShadow,
            maxWidth: 420, display: 'flex', gap: 12, alignItems: 'flex-start',
            animation: 'fadeIn 0.4s ease'
          }}>
            <FileCheck size={22} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Nueva firma recibida</div>
              <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>{notification.msg}</div>
            </div>
            <button onClick={() => setNotification(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0, marginLeft: 'auto' }}>
              ✕
            </button>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/nuevo" element={<NuevoProyecto />} />
          <Route path="/borradores" element={<Borradores sessionCache={sessionCache} setSessionCache={setSessionCache} />} />
          <Route path="/bandeja" element={<BandejaEntrada />} />
          {user.tipo_usuario === 3 && <Route path="/jefes-obra" element={<JefesObra />} />}
          <Route path="/proyectos" element={<Proyectos />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/proveedores" element={<Proveedores />} />
          <Route path="/comparativa" element={<Comparativa sessionCache={sessionCache} setSessionCache={setSessionCache} />} />
          <Route path="/base-precios" element={<BasePrecios />} />
          <Route path="/historial" element={<Historial />} />
          <Route path="/presupuestos-firmados" element={<PresupuestosFirmados />} />
          {(user.tipo_usuario === 1 || user.tipo_usuario === 2) && <Route path="/usuarios" element={<Usuarios />} />}
          <Route path="/ajustes" element={<Ajustes />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </main>
    </div>
  );
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;
