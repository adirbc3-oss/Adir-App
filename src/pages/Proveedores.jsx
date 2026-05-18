import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabaseClient';
import { TODOS_LOS_OFICIOS } from '../utils/aiAllocation';
import { useModal, useToast } from '../utils/useModal';
import { UserPlus, Trash2, Loader2, RefreshCw, Search, Users } from 'lucide-react';

const Proveedores = () => {
    const { showConfirm, ModalUI } = useModal();
    const { showToast, ToastUI } = useToast();

    const [proveedores, setProveedores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [filtroOficio, setFiltroOficio] = useState('');

    const provsRef = useRef([]);
    const debounceTimer = useRef(null);

    useEffect(() => { provsRef.current = proveedores; }, [proveedores]);

    const [newProv, setNewProv] = useState({ Nombre: '', Oficio: '', OtroOficio: '', Email: '', Telefono: '' });

    const listadoOficiosDinamico = [...new Set([
        ...TODOS_LOS_OFICIOS,
        ...proveedores.map(p => p.Oficio).filter(Boolean)
    ])].sort();

    const fetchProveedores = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.from('proveedores').select('*');
            if (error) throw error;
            if (data) {
                setProveedores(data.map(p => ({
                    id: p.id,
                    Nombre: p.nombre_empresa,
                    Oficio: p.oficio_principal,
                    Email: p.email,
                    Telefono: p.telefono || ''
                })));
            }
        } catch (error) {
            console.error("Error fetching providers:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchProveedores(); }, []);

    const handleAdd = async (e) => {
        e.preventDefault();
        const oficioFinal = newProv.Oficio === 'Otro' ? newProv.OtroOficio : newProv.Oficio;
        if (!newProv.Nombre || !oficioFinal) { showToast('Nombre y Especialidad son obligatorios.', 'error'); return; }
        const newId = Math.random().toString(36).substring(2, 10);
        const { data, error } = await supabase.from('proveedores').insert([{
            id: newId, nombre_empresa: newProv.Nombre, oficio_principal: oficioFinal, email: newProv.Email, telefono: newProv.Telefono
        }]).select();
        if (error) { showToast('Error al guardar: ' + error.message, 'error'); }
        else {
            setProveedores(prev => [...prev, { id: data[0].id, Nombre: data[0].nombre_empresa, Oficio: data[0].oficio_principal, Email: data[0].email, Telefono: data[0].telefono || '' }]);
            setNewProv({ Nombre: '', Oficio: '', OtroOficio: '', Email: '', Telefono: '' });
            setShowAddForm(false);
            showToast('Proveedor guardado en Supabase.');
        }
    };

    const handleDelete = async (index) => {
        const prov = proveedores[index];
        showConfirm(
            `¿Seguro que quieres eliminar a ${prov.Nombre}? Se borrarán también sus solicitudes y respuestas asociadas. Esta acción no se puede deshacer.`,
            async () => {
                if (!prov.id) {
                    setProveedores(prev => prev.filter((_, i) => i !== index));
                    return;
                }
                try {
                    // 1. Buscar solicitudes de este proveedor
                    const { data: sols } = await supabase
                        .from('solicitudes')
                        .select('id')
                        .eq('proveedor_id', prov.id);

                    if (sols && sols.length > 0) {
                        const solIds = sols.map(s => s.id);
                        // 2. Borrar respuestas de esas solicitudes
                        await supabase.from('respuestas').delete().in('solicitud_id', solIds);
                        // 3. Borrar las solicitudes
                        await supabase.from('solicitudes').delete().in('id', solIds);
                    }

                    // 4. Borrar el proveedor
                    const { error } = await supabase.from('proveedores').delete().eq('id', prov.id);
                    if (error) { showToast('Error al borrar: ' + error.message, 'error'); return; }

                    setProveedores(prev => prev.filter((_, i) => i !== index));
                    showToast('Proveedor y datos asociados eliminados.', 'warning');
                } catch (err) {
                    showToast('Error en el borrado: ' + err.message, 'error');
                }
            },
            { title: 'Eliminar Proveedor', type: 'danger', confirmLabel: 'Sí, eliminar' }
        );
    };

    const updateCell = (index, field, value) => {
        const copy = [...proveedores];
        copy[index][field] = value;
        setProveedores(copy);
    };

    const handleBlurCell = (provId) => {
        if (!provId) return;
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(async () => {
            const currentProv = provsRef.current.find(p => p.id === provId);
            if (!currentProv) return;
            const { error } = await supabase.from('proveedores').update({
                nombre_empresa: currentProv.Nombre,
                oficio_principal: currentProv.Oficio,
                email: currentProv.Email,
                telefono: currentProv.Telefono
            }).eq('id', currentProv.id);
            if (!error) showToast('Auto-guardado completado.', 'success');
            else showToast('Error al auto-guardar: ' + error.message, 'error');
        }, 800);
    };

    // Filtrado combinado
    const filteredProvs = proveedores.filter((p) => {
        const term = searchTerm.toLowerCase();
        const matchSearch = !term ||
            (p.Nombre || '').toLowerCase().includes(term) ||
            (p.Oficio || '').toLowerCase().includes(term) ||
            (p.Email || '').toLowerCase().includes(term);
        const matchOficio = !filtroOficio || p.Oficio === filtroOficio;
        return matchSearch && matchOficio;
    });

    // Stats por oficio
    const byOficio = proveedores.reduce((acc, p) => {
        const k = p.Oficio || 'Sin oficio';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
    }, {});
    const topOficios = Object.entries(byOficio).sort((a, b) => b[1] - a[1]).slice(0, 5);

    return (
        <div className="animate-fade-in">
            {ModalUI}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h1>Gestion de Proveedores</h1>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button className="btn btn-secondary" onClick={fetchProveedores} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'loader-spinner' : ''} /> Refrescar
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
                        <UserPlus size={16} /> {showAddForm ? 'Cerrar' : 'Añadir Proveedor'}
                    </button>
                </div>
            </div>

            <p style={{ color: 'var(--text-muted)', marginBottom: '16px' }}>Base de datos centralizada compartida con el módulo de licitaciones.</p>

            {/* Stats por oficio */}
            {!loading && proveedores.length > 0 && (
                <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
                    <div style={{ background: 'rgba(0,45,84,0.08)', borderRadius: '10px', padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid rgba(0,45,84,0.15)' }}>
                        <Users size={16} color="var(--primary)" />
                        <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{proveedores.length}</span>
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>proveedores</span>
                    </div>
                    {topOficios.map(([oficio, count]) => (
                        <div
                            key={oficio}
                            onClick={() => setFiltroOficio(filtroOficio === oficio ? '' : oficio)}
                            style={{
                                background: filtroOficio === oficio ? 'rgba(0,45,84,0.12)' : 'var(--bg-secondary)',
                                border: filtroOficio === oficio ? '1px solid var(--primary)' : '1px solid transparent',
                                borderRadius: '10px', padding: '8px 14px', cursor: 'pointer',
                                display: 'flex', alignItems: 'center', gap: '6px', transition: 'all 0.2s'
                            }}
                        >
                            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-main)' }}>{oficio}</span>
                            <span style={{ background: 'var(--primary)', color: 'white', borderRadius: '10px', padding: '1px 7px', fontSize: '0.72rem', fontWeight: 700 }}>{count}</span>
                        </div>
                    ))}
                    {filtroOficio && (
                        <div onClick={() => setFiltroOficio('')} style={{ background: '#fee2e2', border: '1px solid #fecaca', borderRadius: '10px', padding: '8px 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.8rem', color: '#dc2626', fontWeight: 600 }}>x Limpiar filtro</span>
                        </div>
                    )}
                </div>
            )}

            {showAddForm && (
                <div className="glass-card animate-fade-in" style={{ marginBottom: '20px', border: '1px solid var(--accent-primary)' }}>
                    <h2>Añadir Nuevo Contacto</h2>
                    <form onSubmit={handleAdd} style={{ marginTop: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div className="form-group">
                                <label>Nombre de la Empresa</label>
                                <input type="text" placeholder="Ej: Construcciones S.L." value={newProv.Nombre} onChange={e => setNewProv({ ...newProv, Nombre: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Especialidad / Oficio</label>
                                <select value={newProv.Oficio} onChange={e => setNewProv({ ...newProv, Oficio: e.target.value })}>
                                    <option value="">Selecciona...</option>
                                    {listadoOficiosDinamico.map(o => <option key={o} value={o}>{o}</option>)}
                                    <option value="Otro">Otro...</option>
                                </select>
                            </div>
                            {newProv.Oficio === 'Otro' && (
                                <div className="form-group animate-fade-in">
                                    <label>Especificar Otro Oficio</label>
                                    <input type="text" placeholder="Ej: Microcementos" value={newProv.OtroOficio} onChange={e => setNewProv({ ...newProv, OtroOficio: e.target.value })} style={{ border: '1px solid var(--accent-primary)' }} />
                                </div>
                            )}
                            <div className="form-group">
                                <label>Email de Contacto</label>
                                <input type="email" placeholder="correo@ejemplo.com" value={newProv.Email} onChange={e => setNewProv({ ...newProv, Email: e.target.value })} />
                            </div>
                            <div className="form-group">
                                <label>Teléfono</label>
                                <input type="text" placeholder="600 000 000" value={newProv.Telefono} onChange={e => setNewProv({ ...newProv, Telefono: e.target.value })} />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button type="submit" className="btn btn-primary">Guardar Proveedor</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="glass-card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
                    <div>
                        <h2 style={{ margin: 0 }}>Directorio Activo (Nube)</h2>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>Los cambios se guardan automáticamente al salir del campo.</span>
                    </div>
                    <div style={{ position: 'relative', minWidth: '240px' }}>
                        <Search size={16} style={{ position: 'absolute', top: '11px', left: '10px', color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Buscar por nombre, oficio o email..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ paddingLeft: '34px', width: '100%', fontSize: '0.85rem' }}
                        />
                    </div>
                </div>

                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center' }}>
                        <Loader2 className="loader-spinner" style={{ display: 'inline-block' }} />
                        <p style={{ marginTop: '12px' }}>Sincronizando con Supabase...</p>
                    </div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th style={{ width: '25%' }}>Nombre</th>
                                    <th style={{ width: '25%' }}>Oficio</th>
                                    <th style={{ width: '25%' }}>Email</th>
                                    <th style={{ width: '15%' }}>Teléfono</th>
                                    <th style={{ width: '10%', textAlign: 'center' }}>Borrar</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredProvs.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '30px' }}>
                                            {proveedores.length === 0 ? 'No hay proveedores registrados.' : 'Ningún proveedor coincide con los filtros.'}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredProvs.map((p) => {
                                        const idx = proveedores.findIndex(x => x.id === p.id);
                                        return (
                                            <tr key={p.id || idx}>
                                                <td>
                                                    <input type="text" value={p.Nombre || ''} onChange={e => updateCell(idx, 'Nombre', e.target.value)} onBlur={() => handleBlurCell(p.id)} style={{ width: '100%', minWidth: '160px', border: '1px solid transparent', padding: '6px', background: 'transparent' }} />
                                                </td>
                                                <td>
                                                    <select value={p.Oficio || ''} onChange={e => updateCell(idx, 'Oficio', e.target.value)} onBlur={() => handleBlurCell(p.id)} style={{ width: '100%', minWidth: '180px', border: '1px solid transparent', padding: '6px', background: 'transparent' }}>
                                                        <option value="" disabled>Seleccionar...</option>
                                                        {![...listadoOficiosDinamico].includes(p.Oficio) && p.Oficio && (
                                                            <option value={p.Oficio}>{p.Oficio}</option>
                                                        )}
                                                        {listadoOficiosDinamico.map(o => <option key={o} value={o}>{o}</option>)}
                                                    </select>
                                                </td>
                                                <td>
                                                    <input type="email" value={p.Email || ''} onChange={e => updateCell(idx, 'Email', e.target.value)} onBlur={() => handleBlurCell(p.id)} style={{ width: '100%', minWidth: '200px', border: '1px solid transparent', padding: '6px', background: 'transparent' }} />
                                                </td>
                                                <td>
                                                    <input type="text" value={p.Telefono || ''} onChange={e => updateCell(idx, 'Telefono', e.target.value)} onBlur={() => handleBlurCell(p.id)} style={{ width: '100%', minWidth: '120px', border: '1px solid transparent', padding: '6px', background: 'transparent' }} />
                                                </td>
                                                <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                                                    <button onClick={() => handleDelete(idx)} style={{ background: 'transparent', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer' }}>
                                                        <Trash2 size={18} />
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
            {ToastUI}
        </div>
    );
};

export default Proveedores;
