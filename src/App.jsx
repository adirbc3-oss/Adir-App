import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { FileUp, Files, Users, Settings, BarChart2, Mailbox, HardHat, Database, History, FileCheck } from 'lucide-react';
import { supabase } from './utils/supabaseClient';

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

import logoAdir from './assets/adir_logo.png';

const Sidebar = () => {
  return (
    <div className="sidebar">
      <div className="sidebar-header animate-fade-in">
        <img src={logoAdir} alt="ADIR Logo" className="sidebar-logo" />
      </div>

      <div className="sidebar-nav">
        <NavLink to="/nuevo" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <FileUp size={20} />
          Procesar BC3
        </NavLink>

        <NavLink to="/borradores" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <Files size={20} />
          Borradores en Curso
        </NavLink>

        <NavLink to="/bandeja" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <Mailbox size={20} />
          Buzón Entrada
        </NavLink>

        <NavLink to="/jefes-obra" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <HardHat size={20} />
          Jefes de Obra
        </NavLink>

        <NavLink to="/proyectos" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <Files size={20} />
          Obras y Proyectos
        </NavLink>

        <NavLink to="/proveedores" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <Users size={20} />
          Proveedores
        </NavLink>

        <NavLink to="/comparativa" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <BarChart2 size={20} />
          Comparativa
        </NavLink>

        <NavLink to="/base-precios" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <Database size={20} />
          Base Precios
        </NavLink>

        <NavLink to="/historial" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <History size={20} />
          Historial
        </NavLink>

        <NavLink to="/ajustes" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
          <Settings size={20} />
          Ajustes
        </NavLink>
      </div>
    </div>
  );
};

const AppContent = () => {
  const location = useLocation();
  const [sessionCache, setSessionCache] = React.useState({});
  const [notification, setNotification] = useState(null);

  const isPortal = location.pathname.startsWith('/portal') || location.pathname.startsWith('/presupuesto-cliente');

  // ─── Supabase Realtime: Notificación cuando un cliente firma ───
  useEffect(() => {
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
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []);

  if (isPortal) {
    return (
      <Routes>
        <Route path="/portal" element={<Portal />} />
        <Route path="/presupuesto-cliente" element={<PresupuestoCliente />} />
      </Routes>
    );
  }

  return (
    <div className="app-container">
      <Sidebar />
      <main className="main-content">
        {/* Toast de notificación en tiempo real */}
        {notification && (
          <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 99999,
            background: 'linear-gradient(135deg, #15803d, #16a34a)',
            color: 'white', padding: '16px 24px', borderRadius: 14,
            boxShadow: '0 8px 32px rgba(22,163,74,0.4)',
            maxWidth: 420, display: 'flex', gap: 12, alignItems: 'flex-start',
            animation: 'fadeIn 0.4s ease'
          }}>
            <FileCheck size={22} style={{ flexShrink: 0, marginTop: 2 }} />
            <div>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>Nueva firma recibida</div>
              <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>{notification.msg}</div>
              <a href="/presupuestos" style={{ display: 'inline-block', marginTop: 8, fontSize: '0.8rem', color: 'white', textDecoration: 'underline' }}>
                Ver en Contratos →
              </a>
            </div>
            <button onClick={() => setNotification(null)} style={{ background: 'none', border: 'none', color: 'white', cursor: 'pointer', padding: 0, marginLeft: 'auto' }}>
              ✕
            </button>
          </div>
        )}
        <Routes>
          <Route path="/" element={<Navigate to="/nuevo" replace />} />
          <Route path="/nuevo" element={<NuevoProyecto />} />
          <Route path="/borradores" element={<Borradores sessionCache={sessionCache} setSessionCache={setSessionCache} />} />
          <Route path="/bandeja" element={<BandejaEntrada />} />
          <Route path="/jefes-obra" element={<JefesObra />} />
          <Route path="/proyectos" element={<Proyectos />} />
          <Route path="/proveedores" element={<Proveedores />} />
          <Route path="/comparativa" element={<Comparativa sessionCache={sessionCache} setSessionCache={setSessionCache} />} />
          <Route path="/base-precios" element={<BasePrecios />} />
          <Route path="/historial" element={<Historial />} />
          <Route path="/ajustes" element={<Ajustes />} />
        </Routes>
      </main>
    </div>
  );
};

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
