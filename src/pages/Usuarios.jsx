import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useModal } from '../utils/useModal';
import { Edit2, Trash2, Plus, LogOut } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';

const TIPOS_USUARIO = {
  0: 'Usuario / Resp. Obra',
  1: 'Administrador',
  2: 'Administración',
  3: 'Jefe de Obra'
};

// Convierte texto plano a hexadecimal (UTF-8) → "1234" = "31323334"
const toHex = (str) =>
  Array.from(new TextEncoder().encode(str))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const useToast = () => {
  const [toast, setToast] = useState(null);
  // useCallback estable: evita recrear la función en cada render (causaba loop infinito)
  const show = React.useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  }, []);
  return { toast, show };
};

const EMPTY_FORM = {
  nombre: '',
  apellido: '',
  correo: '',
  contrasena: '',
  tipo_usuario: 0
};

const Usuarios = () => {
  const { user, logout } = useAuth();
  const { toast, show: showToast } = useToast();
  const { showConfirm, ModalUI } = useModal();
  const navigate = useNavigate();
  const [usuarios, setUsuarios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);

  // Verificar permisos
  useEffect(() => {
    if (!user || (user.tipo_usuario !== 1 && user.tipo_usuario !== 2)) {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const fetchUsuarios = React.useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id,nombre,apellido,correo,tipo_usuario')
        .order('nombre', { ascending: true });

      if (error) throw error;
      setUsuarios(data || []);
    } catch (err) {
      console.error('Error fetching usuarios:', err);
      showToast('Error al cargar usuarios', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchUsuarios();
  }, [fetchUsuarios]);

  const filteredUsuarios = useMemo(() => {
    if (!search.trim()) return usuarios;
    const q = search.toLowerCase();
    return usuarios.filter((u) =>
      u.nombre?.toLowerCase().includes(q) ||
      u.apellido?.toLowerCase().includes(q) ||
      u.correo?.toLowerCase().includes(q)
    );
  }, [usuarios, search]);

  const openNew = () => {
    setEditingItem(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (u) => {
    setEditingItem(u);
    setForm({
      nombre: u.nombre || '',
      apellido: u.apellido || '',
      correo: u.correo || '',
      contrasena: '',
      tipo_usuario: u.tipo_usuario ?? 0
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!form.nombre.trim() || !form.correo.trim()) {
      showToast('Campos requeridos: nombre y correo', 'error');
      return;
    }

    if (!editingItem && !form.contrasena.trim()) {
      showToast('Contraseña requerida para nuevo usuario', 'error');
      return;
    }

    setSaving(true);
    try {
      if (editingItem) {
        const updateData = {
          nombre: form.nombre,
          apellido: form.apellido,
          correo: form.correo,
          tipo_usuario: form.tipo_usuario
        };
        // Solo cambiar contraseña si se ha escrito una nueva
        if (form.contrasena.trim()) {
          updateData.contrasena = toHex(form.contrasena);
        }

        const { error } = await supabase
          .from('usuarios')
          .update(updateData)
          .eq('id', editingItem.id);

        if (error) throw error;
        showToast('Usuario actualizado', 'success');
      } else {
        const insertData = {
          nombre: form.nombre,
          apellido: form.apellido,
          correo: form.correo,
          contrasena: toHex(form.contrasena),
          tipo_usuario: form.tipo_usuario,
          isActive: 1
        };

        const { error } = await supabase.from('usuarios').insert([insertData]);

        if (error) throw error;
        showToast('Usuario creado', 'success');
      }

      setShowModal(false);
      fetchUsuarios();
    } catch (err) {
      console.error('Error saving usuario:', err);
      showToast(err.message || 'Error al guardar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (u) => {
    showConfirm(
      `¿Eliminar al usuario "${u.nombre} ${u.apellido}"?`,
      async () => {
        try {
          const { error } = await supabase.from('usuarios').delete().eq('id', u.id);
          if (error) throw error;
          showToast('Usuario eliminado', 'success');
          fetchUsuarios();
        } catch (err) {
          console.error('Error deleting usuario:', err);
          showToast('Error al eliminar', 'error');
        }
      },
      { type: 'danger', confirmLabel: 'Eliminar', title: 'Eliminar Usuario' }
    );
  };

  return (
    <div style={{ padding: '24px' }}>
      {ModalUI}
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 700, color: '#1e293b', margin: '0 0 8px' }}>
            Gestión de Usuarios
          </h1>
          <p style={{ fontSize: '14px', color: '#64748b', margin: 0 }}>
            Administra usuarios del sistema
          </p>
        </div>
        <button
          onClick={logout}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 16px',
            background: '#f1f5f9',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '14px',
            color: '#64748b'
          }}
        >
          <LogOut size={18} />
          Cerrar Sesión
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          zIndex: 99999,
          background: toast.type === 'error' ? '#fee2e2' : '#dcfce7',
          color: toast.type === 'error' ? '#b91c1c' : '#166534',
          padding: '16px 24px',
          borderRadius: 8,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          animation: 'fadeIn 0.3s ease'
        }}>
          {toast.msg}
        </div>
      )}

      {/* Search & Create */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24 }}>
        <input
          type="text"
          placeholder="Buscar usuario..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            flex: 1,
            padding: '10px 16px',
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            fontSize: '14px',
            outline: 'none'
          }}
        />
        <button
          onClick={openNew}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            background: '#06b6d4',
            color: 'white',
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 600
          }}
        >
          <Plus size={18} />
          Nuevo Usuario
        </button>
      </div>

      {/* Tabla */}
      <div style={{ background: 'white', borderRadius: 8, boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>Cargando...</div>
        ) : filteredUsuarios.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: '#64748b' }}>No hay usuarios</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Nombre</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Correo</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Tipo</th>
                <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: 600, color: '#64748b' }}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsuarios.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#1e293b' }}>
                    {u.nombre} {u.apellido}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '14px', color: '#64748b' }}>
                    {u.correo}
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 12px',
                      background: '#e0f2fe',
                      color: '#0369a1',
                      borderRadius: 4,
                      fontWeight: 600
                    }}>
                      {TIPOS_USUARIO[u.tipo_usuario] || 'Desconocido'}
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <button
                      onClick={() => openEdit(u)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#0ea5e9', padding: '4px' }}
                      title="Editar"
                    >
                      <Edit2 size={18} />
                    </button>
                    <button
                      onClick={() => handleDelete(u)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px', marginLeft: 8 }}
                      title="Eliminar"
                    >
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '20px'
        }}>
          <div style={{
            background: 'white',
            borderRadius: 12,
            width: '100%',
            maxWidth: '480px',
            padding: '32px',
            boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#1e293b', marginBottom: 24 }}>
              {editingItem ? 'Editar Usuario' : 'Nuevo Usuario'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <input
                  type="text"
                  placeholder="Nombre"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '14px', outline: 'none' }}
                />
                <input
                  type="text"
                  placeholder="Apellido"
                  value={form.apellido}
                  onChange={(e) => setForm({ ...form, apellido: e.target.value })}
                  style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '14px', outline: 'none' }}
                />
              </div>

              <input
                type="email"
                placeholder="Correo"
                value={form.correo}
                onChange={(e) => setForm({ ...form, correo: e.target.value })}
                style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '14px', outline: 'none' }}
              />

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: '#64748b', display: 'block', marginBottom: 4 }}>
                  {editingItem ? 'Nueva contraseña (dejar en blanco para no cambiar)' : 'Contraseña *'}
                </label>
                <input
                  type="password"
                  placeholder={editingItem ? '••••••••' : 'Contraseña inicial'}
                  value={form.contrasena}
                  onChange={(e) => setForm({ ...form, contrasena: e.target.value })}
                  style={{ width: '100%', padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <select
                value={form.tipo_usuario}
                onChange={(e) => setForm({ ...form, tipo_usuario: parseInt(e.target.value) })}
                style={{ padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '14px', outline: 'none' }}
              >
                {Object.entries(TIPOS_USUARIO).map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
              <button
                onClick={() => setShowModal(false)}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: '#f1f5f9',
                  border: '1px solid #e2e8f0',
                  borderRadius: 6,
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 600,
                  color: '#64748b'
                }}
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  background: saving ? '#cbd5e1' : '#06b6d4',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  cursor: saving ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 600
                }}
              >
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Usuarios;
