import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useModal, useToast } from '../utils/useModal';
import { UserPlus, Trash2, Loader2, RefreshCw, CheckCircle } from 'lucide-react';

const Proveedores = () => {
    const { showConfirm, ModalUI } = useModal();
    const { showToast, ToastUI } = useToast();

    const [proveedores, setProveedores] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    
    // Timer debounce state cache (para evitar race conditions)
    const provsRef = useRef([]);
    const debounceTimer = useRef(null);

    useEffect(() => {
        provsRef.current = proveedores;
    }, [proveedores]);



    // Formulario nuevo proveedor
    const [newProv, setNewProv] = useState({
        Nombre: '',
        Oficio: '',
        OtroOficio: '',
        Email: '',
        Telefono: ''
    });

    const listadoOficiosDinámico = [...new Set([
        ...[
            "Albañilería", "Estructuras de Hormigón", "Estructuras Metálicas",
            "Movimiento de Tierras", "Cimentaciones", "Cubiertas y Tejados",
            "Impermeabilización", "Aislamientos", "Fontanería", "Electricidad",
            "Climatización (HVAC)", "Carpintería de Madera", "Carpintería Metálica/Aluminio",
            "Cristalería", "Pintura", "Yesos y Escayolas", "Solados y Alicatados",
            "Falsos Techos", "Ascensores y Elevación", "Cerrajeria", "Jardinería y Exteriores",
            "Limpieza de Obra", "Gestión de Residuos", "Seguridad y Salud", "Topografía"
        ],
        ...proveedores.map(p => p.Oficio).filter(Boolean)
    ])].sort();

    const fetchProveedores = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase.from('proveedores').select('*');
            if (error) throw error;
            if (data) {
                const formattedData = data.map(p => ({
                    id: p.id,
                    Nombre: p.nombre_empresa,
                    Oficio: p.oficio_principal,
                    Email: p.email,
                    Telefono: p.telefono || ''
                }));
                setProveedores(formattedData);
            }
        } catch (error) {
            console.error("Error fetching providers:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchProveedores();
    }, []);

    const handleAdd = async (e) => {
        e.preventDefault();
        const oficioFinal = newProv.Oficio === 'Otro' ? newProv.OtroOficio : newProv.Oficio;
        if (!newProv.Nombre || !oficioFinal) {
            showToast('Nombre y Especialidad son obligatorios.', 'error');
            return;
        }
        const newId = Math.random().toString(36).substring(2, 10);
        const { data, error } = await supabase.from('proveedores').insert([{
            id: newId,
            nombre_empresa: newProv.Nombre,
            oficio_principal: oficioFinal,
            email: newProv.Email,
            telefono: newProv.Telefono
        }]).select();
        if (error) {
            showToast('Error al guardar: ' + error.message, 'error');
        } else {
            setProveedores(prev => [...prev, {
                id: data[0].id,
                Nombre: data[0].nombre_empresa,
                Oficio: data[0].oficio_principal,
                Email: data[0].email,
                Telefono: data[0].telefono || ''
            }]);
            setNewProv({ Nombre: '', Oficio: '', OtroOficio: '', Email: '', Telefono: '' });
            setShowAddForm(false);
            showToast('Proveedor guardado en Supabase.');
        }
    };

    const handleDelete = async (index) => {
        const prov = proveedores[index];
        showConfirm(
            `¿Seguro que quieres eliminar a ${prov.Nombre}? Esta acción no se puede deshacer.`,
            async () => {
                if (prov.id) {
                    const { error } = await supabase.from('proveedores').delete().eq('id', prov.id);
                    if (error) { showToast('Error al borrar: ' + error.message, 'error'); return; }
                }
                setProveedores(prev => prev.filter((_, i) => i !== index));
                showToast('Proveedor eliminado.', 'warning');
            },
            { title: 'Eliminar Proveedor', type: 'danger', confirmLabel: 'Sí, eliminar' }
        );
    };

    const updateCell = (index, field, value) => {
        const copy = [...proveedores];
        copy[index][field] = value;
        setProveedores(copy);
    };

    // Guarda usando un mecanismo de Debounce de 800ms para evitar sobrecarga y superposiciones
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


    return (
        <div className="animate-fade-in">
            {ModalUI}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <h1>👷 Gestión de Proveedores</h1>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <button className="btn btn-secondary" onClick={fetchProveedores} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'loader-spinner' : ''} /> Refrescar
                    </button>
                    <button className="btn btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
                        <UserPlus size={16} /> {showAddForm ? 'Cerrar' : 'Añadir Proveedor'}
                    </button>
                </div>
            </div>


            <p>Base de datos centralizada compartida con el módulo de Python y Licitaciones.</p>

            {showAddForm && (
                <div className="glass-card animate-fade-in" style={{ marginTop: '24px', border: '1px solid var(--accent-primary)' }}>
                    <h2>Añadir Nuevo Contacto</h2>
                    <form onSubmit={handleAdd} style={{ marginTop: '16px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                            <div className="form-group">
                                <label>Nombre de la Empresa</label>
                                <input
                                    type="text"
                                    placeholder="Ej: Construcciones S.L."
                                    value={newProv.Nombre}
                                    onChange={e => setNewProv({ ...newProv, Nombre: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Especialidad / Oficio</label>
                                <select
                                    value={newProv.Oficio}
                                    onChange={e => setNewProv({ ...newProv, Oficio: e.target.value })}
                                >
                                    <option value="">Selecciona...</option>
                                    {listadoOficiosDinámico.map(o => <option key={o} value={o}>{o}</option>)}
                                    <option value="Otro">Otro...</option>
                                </select>
                            </div>
                            {newProv.Oficio === 'Otro' && (
                                <div className="form-group animate-fade-in">
                                    <label>Especificar Otro Oficio</label>
                                    <input
                                        type="text"
                                        placeholder="Ej: Microcementos"
                                        value={newProv.OtroOficio}
                                        onChange={e => setNewProv({ ...newProv, OtroOficio: e.target.value })}
                                        style={{ border: '1px solid var(--accent-primary)' }}
                                    />
                                </div>
                            )}
                            <div className="form-group">
                                <label>Email de Contacto</label>
                                <input
                                    type="email"
                                    placeholder="correo@ejemplo.com"
                                    value={newProv.Email}
                                    onChange={e => setNewProv({ ...newProv, Email: e.target.value })}
                                />
                            </div>
                            <div className="form-group">
                                <label>Teléfono</label>
                                <input
                                    type="text"
                                    placeholder="600 000 000"
                                    value={newProv.Telefono}
                                    onChange={e => setNewProv({ ...newProv, Telefono: e.target.value })}
                                />
                            </div>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                            <button type="submit" className="btn btn-primary">Guardar en Lista Temporal</button>
                        </div>
                    </form>
                </div>
            )}

            <div className="glass-card" style={{ marginTop: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                    <h2>Directorio Activo (Nube)</h2>
                    <span style={{ fontSize: 12, color: '#6b7280' }}>Los cambios se guardan automáticamente al salir del campo.</span>
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
                                {proveedores.length === 0 ? (
                                    <tr>
                                        <td colSpan="5" style={{ textAlign: 'center' }}>No hay proveedores registrados.</td>
                                    </tr>
                                ) : (
                                    proveedores.map((p, idx) => (
                                        <tr key={idx}>
                                            <td>
                                                <input type="text" value={p.Nombre || ''}
                                                    onChange={e => updateCell(idx, 'Nombre', e.target.value)}
                                                    onBlur={() => handleBlurCell(p.id)}
                                                    style={{ width: '100%', minWidth: '160px', border: '1px solid transparent', padding: '6px', background: 'transparent' }}
                                                />
                                            </td>
                                            <td>
                                                <select value={p.Oficio || ''}
                                                    onChange={e => updateCell(idx, 'Oficio', e.target.value)}
                                                    onBlur={() => handleBlurCell(p.id)}
                                                    style={{ width: '100%', minWidth: '180px', border: '1px solid transparent', padding: '6px', background: 'transparent' }}
                                                >
                                                    <option value="" disabled>Seleccionar...</option>
                                                    {![...listadoOficiosDinámico].includes(p.Oficio) && p.Oficio && (
                                                        <option value={p.Oficio}>{p.Oficio}</option>
                                                    )}
                                                    {listadoOficiosDinámico.map(o => <option key={o} value={o}>{o}</option>)}
                                                </select>
                                            </td>
                                            <td>
                                                <input type="email" value={p.Email || ''}
                                                    onChange={e => updateCell(idx, 'Email', e.target.value)}
                                                    onBlur={() => handleBlurCell(p.id)}
                                                    style={{ width: '100%', minWidth: '200px', border: '1px solid transparent', padding: '6px', background: 'transparent' }}
                                                />
                                            </td>
                                            <td>
                                                <input type="text" value={p.Telefono || ''}
                                                    onChange={e => updateCell(idx, 'Telefono', e.target.value)}
                                                    onBlur={() => handleBlurCell(p.id)}
                                                    style={{ width: '100%', minWidth: '120px', border: '1px solid transparent', padding: '6px', background: 'transparent' }}
                                                />
                                            </td>
                                            <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                                                <button onClick={() => handleDelete(idx)}
                                                    style={{ background: 'transparent', border: 'none', color: 'var(--accent-danger)', cursor: 'pointer' }}
                                                ><Trash2 size={18} /></button>
                                            </td>
                                        </tr>
                                    ))
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
