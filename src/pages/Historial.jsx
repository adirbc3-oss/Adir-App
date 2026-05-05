import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { History, Search, Filter, Loader2, ArrowRight } from 'lucide-react';

const Historial = () => {
    const [logs, setLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Filtros
    const [searchTerm, setSearchTerm] = useState('');
    const [filtroOrigen, setFiltroOrigen] = useState('');
    const [filtroEntidad, setFiltroEntidad] = useState('');

    useEffect(() => {
        fetchHistorial();
    }, [filtroOrigen, filtroEntidad]);

    const fetchHistorial = async () => {
        setLoading(true);
        try {
            let query = supabase
                .from('historial_cambios')
                .select('*')
                .order('fecha_cambio', { ascending: false })
                .limit(100); // Mostramos los últimos 100 por rendimiento

            if (filtroOrigen) {
                query = query.eq('origen_cambio', filtroOrigen);
            }
            if (filtroEntidad) {
                query = query.eq('tipo_entidad', filtroEntidad);
            }

            const { data, error } = await query;
            if (error) throw error;
            setLogs(data || []);
        } catch (error) {
            console.error('Error al cargar el historial:', error);
        } finally {
            setLoading(false);
        }
    };

    const logsFiltrados = logs.filter(log => {
        if (!searchTerm) return true;
        const term = searchTerm.toLowerCase();
        return (
            (log.proyecto_referencia && log.proyecto_referencia.toLowerCase().includes(term)) ||
            (log.detalles && log.detalles.toLowerCase().includes(term)) ||
            (log.campo_modificado && log.campo_modificado.toLowerCase().includes(term))
        );
    });

    const formatFecha = (fechaStr) => {
        const fecha = new Date(fechaStr);
        return fecha.toLocaleString('es-ES', { 
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });
    };

    const getOrigenBadge = (origen) => {
        let bgColor = 'var(--bg-secondary)';
        let color = 'var(--text-primary)';
        
        if (origen === 'IA') { bgColor = 'rgba(168, 85, 247, 0.15)'; color = '#9333ea'; }
        else if (origen === 'Histórico') { bgColor = 'rgba(59, 130, 246, 0.15)'; color = '#2563eb'; }
        else if (origen === 'Manual') { bgColor = 'rgba(245, 158, 11, 0.15)'; color = '#d97706'; }
        else if (origen === 'Aceptación Presupuesto') { bgColor = 'rgba(22, 163, 74, 0.15)'; color = '#16a34a'; }

        return (
            <span style={{ 
                backgroundColor: bgColor, color: color, padding: '4px 8px', 
                borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' 
            }}>
                {origen}
            </span>
        );
    };

    return (
        <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
            <div className="glass-card" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                    <div style={{ backgroundColor: 'rgba(59, 130, 246, 0.1)', padding: '12px', borderRadius: '12px' }}>
                        <History size={28} color="var(--primary)" />
                    </div>
                    <div>
                        <h1>Historial de Cambios</h1>
                        <p>Registro de auditoría de todas las modificaciones de precios y asignaciones.</p>
                    </div>
                </div>
            </div>

            <div className="glass-card" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap', alignItems: 'center' }}>
                    <div style={{ position: 'relative', flex: '2', minWidth: '250px' }}>
                        <Search size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: 'var(--text-light)' }} />
                        <input 
                            type="text" 
                            placeholder="Buscar por proyecto o detalles..." 
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            style={{ width: '100%', paddingLeft: '40px' }}
                        />
                    </div>
                    
                    <div style={{ flex: '1', minWidth: '150px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <Filter size={18} color="var(--text-muted)" />
                        <select 
                            value={filtroOrigen}
                            onChange={(e) => setFiltroOrigen(e.target.value)}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
                        >
                            <option value="">Cualquier Origen</option>
                            <option value="Manual">Manual</option>
                            <option value="IA">Inteligencia Artificial</option>
                            <option value="Histórico">Histórico</option>
                            <option value="Aceptación Presupuesto">Aceptación Presupuesto</option>
                        </select>
                    </div>

                    <div style={{ flex: '1', minWidth: '150px' }}>
                        <select 
                            value={filtroEntidad}
                            onChange={(e) => setFiltroEntidad(e.target.value)}
                            style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
                        >
                            <option value="">Cualquier Entidad</option>
                            <option value="Partida">Partida (Borradores)</option>
                            <option value="Base ADIR">Base ADIR</option>
                            <option value="Base CYPE">Base CYPE</option>
                        </select>
                    </div>
                </div>
            </div>

            <div className="glass-card" style={{ padding: '0' }}>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Fecha</th>
                                <th>Proyecto / Entidad</th>
                                <th>Origen</th>
                                <th>Campo</th>
                                <th>Cambio</th>
                                <th>Detalles</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '30px' }}>
                                        <Loader2 className="loader-spinner" style={{ display: 'inline-block' }} />
                                    </td>
                                </tr>
                            ) : logsFiltrados.length === 0 ? (
                                <tr>
                                    <td colSpan="6" style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                                        No hay registros que coincidan con los filtros.
                                    </td>
                                </tr>
                            ) : (
                                logsFiltrados.map((log) => (
                                    <tr key={log.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                                        <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                                            {formatFecha(log.fecha_cambio)}
                                        </td>
                                        <td style={{ fontWeight: 'bold' }}>
                                            {log.proyecto_referencia || log.tipo_entidad}
                                        </td>
                                        <td>{getOrigenBadge(log.origen_cambio)}</td>
                                        <td style={{ fontSize: '0.85rem' }}>{log.campo_modificado}</td>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem' }}>
                                                <span style={{ color: 'var(--danger)', textDecoration: 'line-through' }}>
                                                    {log.valor_anterior || '-'}
                                                </span>
                                                <ArrowRight size={14} color="var(--text-muted)" />
                                                <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>
                                                    {log.valor_nuevo || '-'}
                                                </span>
                                            </div>
                                        </td>
                                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={log.detalles}>
                                            {log.detalles}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Historial;
