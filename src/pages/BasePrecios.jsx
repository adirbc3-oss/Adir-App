import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useModal, useToast } from '../utils/useModal';
import { Search, Save, FileUp, Loader2, Database, TableProperties } from 'lucide-react';

const PAGE_SIZE = 50;

const BasePrecios = () => {
    const { showAlert, ModalUI } = useModal();
    const { showToast, ToastUI } = useToast();

    const [activeTab, setActiveTab] = useState('adir'); // 'adir' or 'cype'
    const [data, setData] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [categoriasDisponibles, setCategoriasDisponibles] = useState([]);
    const [page, setPage] = useState(0);
    const [hasMore, setHasMore] = useState(true);
    
    // For editing
    const [editingId, setEditingId] = useState(null);
    const [editValues, setEditValues] = useState({});
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        fetchData(true);
    }, [activeTab, searchTerm, selectedCategory]);

    useEffect(() => {
        cargarCategorias();
        // Reset category filter when changing tabs
        setSelectedCategory('');
    }, [activeTab]);

    const cargarCategorias = async () => {
        const table = activeTab === 'adir' ? 'base_precios_adir' : 'PreciosCype';
        try {
            if (activeTab === 'adir') {
                // En formato BC3/ADIR, los capítulos principales suelen tener códigos cortos terminados en # (ej. "A#", "C#")
                const { data } = await supabase.from(table).select('descripcion_corta').ilike('codigo', '_#');
                if (data) setCategoriasDisponibles([...new Set(data.map(d => d.descripcion_corta))]);
            } else {
                // Para CYPE intentamos sacar categorías únicas de los primeros registros
                const { data } = await supabase.from(table).select('categoria').limit(2000);
                if (data) setCategoriasDisponibles([...new Set(data.map(d => d.categoria).filter(Boolean))]);
            }
        } catch (e) {
            console.error("Error cargando categorías:", e);
        }
    };

    const fetchData = async (reset = false) => {
        setLoading(true);
        const currentPage = reset ? 0 : page;
        if (reset) {
            setPage(0);
            setData([]);
        }

        const table = activeTab === 'adir' ? 'base_precios_adir' : 'PreciosCype';
        
        try {
            // Filtramos los capítulos (códigos que terminan en '#') para mostrar solo partidas reales
            let query = supabase.from(table)
                .select('*')
                .not('codigo', 'ilike', '%#')
                .order('codigo', { ascending: true });
            
            if (searchTerm) {
                query = query.or(`codigo.ilike.%${searchTerm}%,descripcion_corta.ilike.%${searchTerm}%`);
            }

            if (selectedCategory) {
                query = query.ilike('categoria', `%${selectedCategory}%`);
            }

            const from = currentPage * PAGE_SIZE;
            const to = from + PAGE_SIZE - 1;
            
            const { data: resultData, error } = await query.range(from, to);

            if (error) throw error;

            if (resultData) {
                if (reset) {
                    setData(resultData);
                } else {
                    setData(prev => [...prev, ...resultData]);
                }
                setHasMore(resultData.length === PAGE_SIZE);
            }
        } catch (error) {
            console.error("Error fetching data:", error);
            showToast("Error al cargar los datos.", "error");
        } finally {
            setLoading(false);
        }
    };

    const handleLoadMore = () => {
        if (!loading && hasMore) {
            setPage(p => p + 1);
        }
    };

    useEffect(() => {
        if (page > 0) {
            fetchData();
        }
    }, [page]);

    const handleEditClick = (item) => {
        setEditingId(item.id);
        setEditValues({
            precio_total: item.precio_total || 0,
            mano_de_obra: item.mano_de_obra || 0,
            materiales_y_otros: activeTab === 'adir' ? item.materiales_y_otros : item.materiales,
            maquinaria: item.maquinaria || 0
        });
    };

    const handleSaveEdit = async (id) => {
        setSaving(true);
        const table = activeTab === 'adir' ? 'base_precios_adir' : 'PreciosCype';
        
        const updatePayload = {
            precio_total: parseFloat(editValues.precio_total),
            mano_de_obra: parseFloat(editValues.mano_de_obra),
            maquinaria: parseFloat(editValues.maquinaria)
        };

        if (activeTab === 'adir') {
            updatePayload.materiales_y_otros = parseFloat(editValues.materiales_y_otros);
        } else {
            updatePayload.materiales = parseFloat(editValues.materiales_y_otros);
        }

        try {
            const itemOriginal = data.find(d => d.id === id);
            
            const { error } = await supabase.from(table).update(updatePayload).eq('id', id);
            if (error) throw error;
            
            // Log de auditoría
            await supabase.from('historial_cambios').insert({
                origen_cambio: 'Manual',
                tipo_entidad: activeTab === 'adir' ? 'Base ADIR' : 'Base CYPE',
                entidad_id: itemOriginal.codigo,
                campo_modificado: 'Precio Total',
                valor_anterior: String(itemOriginal.precio_total || 0),
                valor_nuevo: String(updatePayload.precio_total),
                detalles: itemOriginal.descripcion_corta
            });
            
            showToast("Precio actualizado correctamente.");
            setData(data.map(d => d.id === id ? { ...d, ...updatePayload } : d));
            setEditingId(null);
        } catch (error) {
            console.error("Error updating price:", error);
            showToast("Error al actualizar precio.", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleUploadBC3 = () => {
        showAlert("Para actualizar los precios desde un BC3, asegúrate de que el script en el servidor esté configurado para recibir subidas o contacta con el administrador del sistema.", { title: "Actualización de Precios", type: "info" });
    };

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
            {ModalUI}
            {ToastUI}

            <div className="glass-card" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
                    <div>
                        <h1>Bases de Precios</h1>
                        <p>Visualiza y modifica las bases de precios oficiales.</p>
                    </div>
                    <div style={{ display: 'flex', gap: '10px' }}>
                        <button className="btn btn-secondary" onClick={handleUploadBC3}>
                            <FileUp size={16} /> Subir BC3 (Actualizar)
                        </button>
                    </div>
                </div>
            </div>

            <div className="glass-card" style={{ marginBottom: '20px', padding: '0' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
                    <button 
                        style={{ 
                            flex: 1, padding: '15px', background: activeTab === 'adir' ? 'var(--primary-light)' : 'transparent',
                            border: 'none', borderBottom: activeTab === 'adir' ? '2px solid var(--primary)' : '2px solid transparent',
                            color: activeTab === 'adir' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                        }}
                        onClick={() => setActiveTab('adir')}
                    >
                        <Database size={18} /> Base Oficial ADIR
                    </button>
                    <button 
                        style={{ 
                            flex: 1, padding: '15px', background: activeTab === 'cype' ? 'var(--primary-light)' : 'transparent',
                            border: 'none', borderBottom: activeTab === 'cype' ? '2px solid var(--primary)' : '2px solid transparent',
                            color: activeTab === 'cype' ? 'var(--primary)' : 'var(--text-muted)', fontWeight: 600, cursor: 'pointer',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                        }}
                        onClick={() => setActiveTab('cype')}
                    >
                        <TableProperties size={18} /> Base CYPE Murcia
                    </button>
                </div>
                
                <div style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
                        <div style={{ position: 'relative', flex: '2', minWidth: '250px' }}>
                            <Search size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: 'var(--text-light)' }} />
                            <input 
                                type="text" 
                                placeholder="Buscar por código o descripción..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                style={{ width: '100%', paddingLeft: '40px' }}
                            />
                        </div>
                        <div style={{ flex: '1', minWidth: '200px' }}>
                            <select 
                                value={selectedCategory}
                                onChange={(e) => setSelectedCategory(e.target.value)}
                                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
                            >
                                <option value="">Todas las categorías</option>
                                {categoriasDisponibles.map((cat, idx) => (
                                    <option key={idx} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>Código</th>
                                    <th>Categoría</th>
                                    <th>Descripción</th>
                                    <th>Ud.</th>
                                    <th>M.O. (€)</th>
                                    <th>Mat/Otros (€)</th>
                                    <th>Maq. (€)</th>
                                    <th>Precio Total (€)</th>
                                    <th>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {data.map((item) => (
                                    <tr key={item.id}>
                                        <td style={{ fontWeight: 'bold' }}>{item.codigo}</td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.categoria}</td>
                                        <td style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.descripcion_corta}>
                                            {item.descripcion_corta}
                                        </td>
                                        <td>{item.unidad}</td>
                                        
                                        {editingId === item.id ? (
                                            <>
                                                <td><input type="number" style={{ width: '70px', padding: '4px' }} value={editValues.mano_de_obra} onChange={e => setEditValues({...editValues, mano_de_obra: e.target.value})} /></td>
                                                <td><input type="number" style={{ width: '70px', padding: '4px' }} value={editValues.materiales_y_otros} onChange={e => setEditValues({...editValues, materiales_y_otros: e.target.value})} /></td>
                                                <td><input type="number" style={{ width: '70px', padding: '4px' }} value={editValues.maquinaria} onChange={e => setEditValues({...editValues, maquinaria: e.target.value})} /></td>
                                                <td><input type="number" style={{ width: '70px', padding: '4px', fontWeight: 'bold' }} value={editValues.precio_total} onChange={e => setEditValues({...editValues, precio_total: e.target.value})} /></td>
                                                <td>
                                                    <div style={{ display: 'flex', gap: '5px' }}>
                                                        <button className="btn btn-success" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => handleSaveEdit(item.id)} disabled={saving}>
                                                            {saving ? '...' : <Save size={14} />}
                                                        </button>
                                                        <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => setEditingId(null)}>
                                                            X
                                                        </button>
                                                    </div>
                                                </td>
                                            </>
                                        ) : (
                                            <>
                                                <td>{item.mano_de_obra}</td>
                                                <td>{activeTab === 'adir' ? item.materiales_y_otros : item.materiales}</td>
                                                <td>{item.maquinaria || 0}</td>
                                                <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{item.precio_total}</td>
                                                <td>
                                                    <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => handleEditClick(item)}>
                                                        Editar
                                                    </button>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        
                        {loading && (
                            <div style={{ textAlign: 'center', padding: '20px' }}>
                                <Loader2 className="loader-spinner" style={{ display: 'inline-block' }} />
                            </div>
                        )}
                        
                        {!loading && data.length === 0 && (
                            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                                No se encontraron resultados.
                            </div>
                        )}

                        {!loading && hasMore && data.length > 0 && (
                            <div style={{ textAlign: 'center', padding: '20px' }}>
                                <button className="btn btn-secondary" onClick={handleLoadMore}>Cargar más</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default BasePrecios;
