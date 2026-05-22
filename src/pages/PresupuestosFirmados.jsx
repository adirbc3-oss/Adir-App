import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { N8N_BASE_URL } from '../config';
import { generarPresupuestoPDF, descargarPDF } from '../utils/pdfUtils';
import {  FileCheck, Download, Clock, X, CheckCircle, Search, Loader2, Eye , FileSignature } from 'lucide-react';

const PresupuestosFirmados = () => {
    const [presupuestos, setPresupuestos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filtroEstado, setFiltroEstado] = useState('');
    const [viendoDetalle, setViendoDetalle] = useState(null);

    useEffect(() => {
        fetchPresupuestos();
    }, []);

    const fetchPresupuestos = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('presupuestos_cliente')
                .select('*')
                .order('fecha_envio', { ascending: false });

            if (error) throw error;
            setPresupuestos(data || []);
        } catch (err) {
            console.error('Error cargando presupuestos:', err);
        } finally {
            setLoading(false);
        }
    };

    const downloadBC3 = (p) => {
        window.open(`${N8N_BASE_URL}/webhook/descargar-bc3?propuesta_id=${encodeURIComponent(p.propuesta_id)}`, '_blank');
    };

    const downloadSignedPDF = (p) => {
        const doc = generarPresupuestoPDF({
            cliente:      p.cliente_nombre || 'Sin especificar',
            propuesta_id: p.propuesta_id,
            descripcion:  p.proyecto_descripcion || p.propuesta_id,
            partidas:     p.partidas || [],
            precio_total: p.precio_total,
            fecha:        p.fecha_envio,
            token:        p.token,
            titulo:       'Contrato de Obra — Copia Firmada',
            firma_base64: p.firma_base64 || null,
            fecha_firma:  p.fecha_firma || null,
        });
        descargarPDF(doc, 'Contrato_Firmado_ADIR_' + p.propuesta_id);
    };

    const getEstadoBadge = (estado) => {
        const styles = {
            firmado: { bg: 'rgba(22,163,74,0.12)', color: '#15803d', icon: <CheckCircle size={13} />, label: 'Firmado' },
            rechazado: { bg: 'rgba(220,38,38,0.12)', color: '#dc2626', icon: <X size={13} />, label: 'Rechazado' },
            pendiente: { bg: 'rgba(245,158,11,0.12)', color: '#d97706', icon: <Clock size={13} />, label: 'Pendiente' }
        };
        const s = styles[estado] || styles.pendiente;
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: s.bg, color: s.color, padding: '4px 10px', borderRadius: 12, fontSize: '0.78rem', fontWeight: 700 }}>
                {s.icon}{s.label}
            </span>
        );
    };

    const filtrados = presupuestos.filter(p => {
        const matchSearch = !searchTerm ||
            (p.cliente_nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
            (p.propuesta_id || '').toLowerCase().includes(searchTerm.toLowerCase());
        const matchEstado = !filtroEstado || p.estado === filtroEstado;
        return matchSearch && matchEstado;
    });

    return (
        <div className="animate-fade-in" style={{ paddingBottom: 40 }}>
            {/* Header */}
            <div className="glass-card" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div>
                            <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}><FileSignature size={32} color="var(--primary)" /> Presupuestos y Contratos</h1>
                            <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Seguimiento de presupuestos enviados a clientes, firmas y rechazos.</p>
                        </div>
                    </div>
                    <button onClick={fetchPresupuestos} className="btn btn-secondary">
                        <RefreshCw size={16} /> Actualizar
                    </button>
                </div>
            </div>

            {/* Filtros */}
            <div className="glass-card" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', gap: 15, flexWrap: 'wrap' }}>
                    <div style={{ position: 'relative', flex: 2, minWidth: 250 }}>
                        <Search size={16} style={{ position: 'absolute', top: 12, left: 12, color: 'var(--text-muted)' }} />
                        <input
                            type="text"
                            placeholder="Buscar por cliente o proyecto..."
                            value={searchTerm}
                            onChange={e => setSearchTerm(e.target.value)}
                            style={{ width: '100%', paddingLeft: 38 }}
                        />
                    </div>
                    <select
                        value={filtroEstado}
                        onChange={e => setFiltroEstado(e.target.value)}
                        style={{ flex: 1, minWidth: 160, padding: '10px', borderRadius: 8, border: '1px solid var(--border-color)', backgroundColor: 'white' }}
                    >
                        <option value="">Todos los estados</option>
                        <option value="pendiente">Pendiente de firma</option>
                        <option value="firmado">Firmados</option>
                        <option value="rechazado">Rechazados</option>
                    </select>
                </div>
            </div>

            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 20 }}>
                {[
                    { label: 'Pendientes', count: presupuestos.filter(p => p.estado === 'pendiente').length, color: '#d97706', bg: 'rgba(245,158,11,0.08)' },
                    { label: 'Firmados', count: presupuestos.filter(p => p.estado === 'firmado').length, color: '#16a34a', bg: 'rgba(22,163,74,0.08)' },
                    { label: 'Rechazados', count: presupuestos.filter(p => p.estado === 'rechazado').length, color: '#dc2626', bg: 'rgba(220,38,38,0.08)' }
                ].map(s => (
                    <div key={s.label} className="glass-card" style={{ textAlign: 'center', backgroundColor: s.bg, borderColor: s.color + '40' }}>
                        <div style={{ fontSize: '2rem', fontWeight: 900, color: s.color }}>{s.count}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>{s.label}</div>
                    </div>
                ))}
            </div>

            {/* Tabla */}
            <div className="glass-card" style={{ padding: 0 }}>
                <div className="table-container">
                    <table>
                        <thead>
                            <tr>
                                <th>Cliente</th>
                                <th>Proyecto</th>
                                <th>Importe</th>
                                <th>Enviado</th>
                                <th>Estado</th>
                                <th>Firmado el</th>
                                <th style={{ textAlign: 'right' }}>Acciones</th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: 40 }}>
                                        <Loader2 className="loader-spinner" style={{ display: 'inline-block' }} />
                                    </td>
                                </tr>
                            ) : filtrados.length === 0 ? (
                                <tr>
                                    <td colSpan="7" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                                        No hay presupuestos que coincidan.
                                    </td>
                                </tr>
                            ) : filtrados.map(p => (
                                <tr key={p.id}>
                                    <td style={{ fontWeight: 600 }}>{p.cliente_nombre || '-'}</td>
                                    <td style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{p.propuesta_id}</td>
                                    <td style={{ fontWeight: 700, color: 'var(--primary)' }}>
                                        {parseFloat(p.precio_total || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                    </td>
                                    <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                        {new Date(p.fecha_envio).toLocaleDateString('es-ES')}
                                    </td>
                                    <td>{getEstadoBadge(p.estado)}</td>
                                    <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                                        {p.fecha_firma ? new Date(p.fecha_firma).toLocaleString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                                    </td>
                                    <td style={{ textAlign: 'right' }}>
                                        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                                            {p.firma_base64 && (
                                                <button onClick={() => setViendoDetalle(p)} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                    <Eye size={13} /> Ver firma
                                                </button>
                                            )}
                                            {p.estado === 'firmado' && (
                                                <button onClick={() => downloadSignedPDF(p)} className="btn btn-primary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                    <Download size={13} /> PDF Firmado
                                                </button>
                                            )}
                                            {p.estado === 'firmado' && (
                                                <button onClick={() => downloadBC3(p)} className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                    <Download size={13} /> BC3
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal de detalle con firma */}
            {viendoDetalle && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'white', borderRadius: 20, padding: 36, maxWidth: 500, width: '90%', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <h3 style={{ margin: 0 }}>Firma Digital — {viendoDetalle.cliente_nombre}</h3>
                            <button onClick={() => setViendoDetalle(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={22} color="var(--text-muted)" />
                            </button>
                        </div>

                        <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 16, marginBottom: 16 }}>
                            <img src={viendoDetalle.firma_base64} alt="Firma del cliente" style={{ width: '100%', border: '1px solid var(--border-color)', borderRadius: 8 }} />
                        </div>

                        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', margin: '0 0 20px' }}>
                            ✅ Firmado el {new Date(viendoDetalle.fecha_firma).toLocaleString('es-ES')} · Proyecto: {viendoDetalle.propuesta_id}
                        </p>

                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={() => setViendoDetalle(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cerrar</button>
                            <button onClick={() => downloadSignedPDF(viendoDetalle)} className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                                <Download size={15} /> Descargar PDF Firmado
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PresupuestosFirmados;
