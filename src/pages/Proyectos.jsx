import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { generarPresupuestoPDF, descargarPDF } from '../utils/pdfUtils';
import { getCleanProjectName } from '../utils/aiAllocation';
import {  
    Loader2, RefreshCw, FolderOpen, CheckCircle, Clock,
    Download, FileCheck, Eye, X, AlertCircle, AlertTriangle, TrendingUp
, Files } from 'lucide-react';

// ─── Modal Genérico ───
const Modal = ({ icon, iconBg, title, children, footer }) => (
    <div style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(8px)', zIndex: 100000,
        display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
        <div style={{
            background: 'white', borderRadius: 20, padding: 36,
            maxWidth: 480, width: '90%', boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
            textAlign: 'center'
        }}>
            {icon && (
                <div style={{
                    width: 64, height: 64, borderRadius: '50%',
                    background: iconBg, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', margin: '0 auto 20px'
                }}>
                    {icon}
                </div>
            )}
            <h3 style={{ margin: '0 0 10px', color: 'var(--text-primary)', fontSize: '1.2rem' }}>{title}</h3>
            <div style={{ color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 24, fontSize: '0.9rem' }}>
                {children}
            </div>
            {footer}
        </div>
    </div>
);

const BtnRow = ({ children }) => (
    <div style={{ display: 'flex', gap: 12 }}>{children}</div>
);

const Proyectos = () => {
    const [proyectos, setProyectos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filtro, setFiltro] = useState('En Curso');
    const [presupuestosMap, setPresupuestosMap] = useState({});
    const [viendoFirma, setViendoFirma] = useState(null);

    // Modales personalizados
    const [modalConfirm, setModalConfirm] = useState(null);  // { title, msg, onConfirm, type }
    const [modalWarn, setModalWarn] = useState(null);         // { title, msg, onConfirm }
    const [toast, setToast] = useState(null);

    const showToast = (msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    useEffect(() => {
        fetchProyectos();
        const channel = supabase
            .channel('proyectos_firma_realtime')
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'presupuestos_cliente' }, () => {
                fetchProyectos();
            })
            .subscribe();
        return () => supabase.removeChannel(channel);
    }, []);

    const fetchProyectos = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('propuestas')
                .select('Proyecto, cliente, jefe_obra, fecha_recepcion, estado')
                .in('estado', ['En Curso', 'Finalizado'])
                .order('fecha_recepcion', { ascending: false });

            if (error) throw error;
            if (data) {
                setProyectos(data);
                await cargarPresupuestos(data.map(p => p.Proyecto));
            }
        } catch (error) {
            console.error('Error fetching projects:', error);
            showToast('Error al cargar proyectos.', 'error');
        } finally {
            setLoading(false);
        }
    };

    const cargarPresupuestos = async (ids) => {
        if (!ids.length) return;
        const { data } = await supabase
            .from('presupuestos_cliente')
            .select('id, propuesta_id, estado, precio_total, fecha_firma, firma_base64, cliente_nombre, partidas, proyecto_descripcion, token, fecha_envio')
            .in('propuesta_id', ids)
            .order('fecha_envio', { ascending: false });

        if (data) {
            const mapa = {};
            data.forEach(p => { if (!mapa[p.propuesta_id]) mapa[p.propuesta_id] = p; });
            setPresupuestosMap(mapa);
        }
    };

    const handleFinalizarObra = (pro) => {
        const presupuesto = presupuestosMap[pro.Proyecto];
        const tieneFirmado = presupuesto?.estado === 'firmado';
        const projName = getCleanProjectName(pro.Proyecto);
        const clientInfo = pro.cliente ? ` (Cliente: ${pro.cliente})` : '';

        if (!tieneFirmado) {
            // Sin contrato firmado → advertencia
            setModalWarn({
                title: 'Sin contrato firmado',
                msg: `El proyecto "${projName}${clientInfo}" no tiene un contrato firmado por el cliente. ¿Quieres finalizarlo igualmente?`,
                onConfirm: () => {
                    setModalWarn(null);
                    confirmarCambioEstado(pro.Proyecto, 'Finalizado');
                }
            });
        } else {
            // Con contrato → confirmación normal
            setModalConfirm({
                title: 'Finalizar Obra',
                msg: `¿Estás seguro de que quieres marcar el proyecto "${projName}${clientInfo}" como Finalizado?`,
                type: 'success',
                onConfirm: () => {
                    setModalConfirm(null);
                    confirmarCambioEstado(pro.Proyecto, 'Finalizado');
                }
            });
        }
    };

    const handleReabrirObra = (pro) => {
        const projName = getCleanProjectName(pro.Proyecto);
        const clientInfo = pro.cliente ? ` (Cliente: ${pro.cliente})` : '';
        setModalConfirm({
            title: 'Reabrir Proyecto',
            msg: `¿Quieres volver a marcar el proyecto "${projName}${clientInfo}" como En Curso?`,
            type: 'info',
            onConfirm: () => {
                setModalConfirm(null);
                confirmarCambioEstado(pro.Proyecto, 'En Curso');
            }
        });
    };

    const confirmarCambioEstado = async (proyectoId, nuevoEstado) => {
        setLoading(true);
        try {
            const { error } = await supabase
                .from('propuestas')
                .update({ estado: nuevoEstado })
                .eq('Proyecto', proyectoId);
            if (error) throw error;
            showToast(`Proyecto marcado como "${nuevoEstado}" correctamente.`);
            fetchProyectos();
        } catch (error) {
            console.error('Error updating status:', error);
            showToast('Error al cambiar estado.', 'error');
            setLoading(false);
        }
    };

    const generarBC3 = (presupuesto) => {
        const allItems = presupuesto.partidas || [];
        const projectId = (presupuesto.propuesta_id || 'PROYECTO').replace(/[|\\]/g, '_');
        const projectName = getCleanProjectName(presupuesto.propuesta_id).replace(/[|\\]/g, ' ');
        const fecha = new Date().toISOString().split('T')[0].replace(/-/g, '');

        const allCodes = new Set(allItems.map(p => p.Capítulo || '').filter(Boolean));

        const findParent = (code) => {
            const base = code.replace(/#$/, '');
            const parts = base.split('.');
            for (let i = parts.length - 1; i >= 1; i--) {
                const candidate = parts.slice(0, i).join('.') + '#';
                if (allCodes.has(candidate)) return candidate;
            }
            return projectId;
        };

        const lines = [];
        lines.push(`~V|FIEBDC-3/95|${fecha}||`);
        lines.push(`~C|${projectId}||${projectName}|0||`);

        allItems.forEach(p => {
            const code = p.Capítulo || '';
            if (!code) return;
            const desc = (p.Descripción || p.texto_partida || '').replace(/\|/g, ' ').replace(/::.*/,'').trim();
            const isStructural = code.endsWith('#');
            const precio = isStructural ? 0 : (parseFloat(p['Precio Total (€)'] || p.precio_base_estimado || 0) || 0);
            const unidad = isStructural ? '' : (p['Unidad IA'] || p.Unidad || p.unidad || 'ud');
            lines.push(`~C|${code}|${unidad}|${desc}|${precio.toFixed(2)}||`);
        });

        const childrenOf = new Map([[projectId, []]]);
        allItems.forEach(p => {
            const code = p.Capítulo || '';
            if (!code) return;
            const cant = parseFloat(p.Cantidad || p.cantidad) || 1;
            const parent = findParent(code);
            if (!childrenOf.has(parent)) childrenOf.set(parent, []);
            childrenOf.get(parent).push({ code, cant });
            if (code.endsWith('#') && !childrenOf.has(code)) childrenOf.set(code, []);
        });

        childrenOf.forEach((children, parent) => {
            if (!children.length) return;
            const str = children.map(c => `${c.code}\\${c.cant.toFixed(2)}\\1`).join('\\');
            lines.push(`~D|${parent}|${str}\\|`);
        });

        return lines.join('\r\n');
    };

    const downloadBC3 = (presupuesto) => {
        const content = generarBC3(presupuesto);
        const blob = new Blob([content], { type: 'text/plain;charset=windows-1252' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${presupuesto.propuesta_id || 'Proyecto'}_Firmado.bc3`;
        a.click();
        URL.revokeObjectURL(url);
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
        descargarPDF(doc, 'Contrato_Firmado_' + p.propuesta_id);
    };

    const getPresupuestoBadge = (presupuesto) => {
        if (!presupuesto) return null;
        const estados = {
            firmado: { bg: 'rgba(22,163,74,0.12)', color: '#15803d', icon: <FileCheck size={12} />, label: 'Firmado' },
            rechazado: { bg: 'rgba(220,38,38,0.12)', color: '#dc2626', icon: <X size={12} />, label: 'Rechazado' },
            pendiente: { bg: 'rgba(245,158,11,0.12)', color: '#d97706', icon: <Clock size={12} />, label: 'Pdte. firma' }
        };
        const s = estados[presupuesto.estado] || estados.pendiente;
        return (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, backgroundColor: s.bg, color: s.color, padding: '3px 8px', borderRadius: 10, fontSize: '0.75rem', fontWeight: 700 }}>
                {s.icon}{s.label}
            </span>
        );
    };

    const proyectosMostrados = proyectos.filter(p => p.estado === filtro);

    return (
        <div className="animate-fade-in">
            {/* Toast */}
            {toast && (
                <div style={{
                    position: 'fixed', bottom: 24, right: 24, zIndex: 200000,
                    padding: '14px 22px', borderRadius: 12, fontWeight: 600, fontSize: '0.9rem',
                    background: toast.type === 'error' ? '#fee2e2' : '#dcfce7',
                    color: toast.type === 'error' ? '#991b1b' : '#166534',
                    border: `1px solid ${toast.type === 'error' ? '#fecaca' : '#bbf7d0'}`,
                    boxShadow: '0 8px 24px rgba(0,0,0,0.12)'
                }}>
                    {toast.msg}
                </div>
            )}

            <div className="glass-card" style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div>
                            <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}><Files size={32} color="var(--primary)" /> Proyectos Activos e Histórico</h1>
                            <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Visualiza y gestiona todo el ciclo de vida de las obras.</p>
                        </div>
                    </div>
                    <button className="btn btn-secondary" onClick={fetchProyectos} disabled={loading}>
                        <RefreshCw size={16} className={loading ? 'loader-spinner' : ''} />
                    </button>
                </div>
            </div>

            {!loading && proyectos.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '14px', marginTop: '20px', marginBottom: '4px' }}>
                    {[
                        { icon: <Clock size={20} color="#3b82f6"/>, label: 'En Curso', value: proyectos.filter(p => p.estado==='En Curso').length, bg: 'rgba(59,130,246,0.08)', color: '#3b82f6' },
                        { icon: <CheckCircle size={20} color="#059669"/>, label: 'Finalizados', value: proyectos.filter(p => p.estado==='Finalizado').length, bg: 'rgba(5,150,105,0.08)', color: '#059669' },
                        { icon: <FileCheck size={20} color="#7c3aed"/>, label: 'Facturacion Firmada', value: Object.values(presupuestosMap).filter(p=>p.estado==='firmado').reduce((s,p)=>s+parseFloat(p.precio_total||0),0).toLocaleString('es-ES',{maximumFractionDigits:0})+' EUR', bg: 'rgba(124,58,237,0.08)', color: '#7c3aed' },
                        { icon: <TrendingUp size={20} color="#d97706"/>, label: 'Pdte. de Firma', value: Object.values(presupuestosMap).filter(p=>p.estado==='pendiente').length, bg: 'rgba(217,119,6,0.08)', color: '#d97706' },
                    ].map((kpi,i) => (
                        <div key={i} style={{ background: kpi.bg, borderRadius: '12px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '12px', border: `1px solid ${kpi.color}22` }}>
                            <div style={{ background: 'white', borderRadius: '8px', padding: '8px', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', flexShrink: 0 }}>{kpi.icon}</div>
                            <div>
                                <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 700 }}>{kpi.label}</div>
                                <div style={{ fontWeight: 800, color: kpi.color, fontSize: '1.05rem', lineHeight: 1.2 }}>{kpi.value}</div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ display: 'flex', gap: '15px', marginTop: '16px', marginBottom: '20px' }}>
                <button className={`btn ${filtro === 'En Curso' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setFiltro('En Curso')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Clock size={16} /> En Curso
                </button>
                <button className={`btn ${filtro === 'Finalizado' ? 'btn-success' : 'btn-secondary'}`} onClick={() => setFiltro('Finalizado')} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <CheckCircle size={16} /> Finalizados
                </button>
            </div>

            <div className="glass-card">
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                    <FolderOpen size={24} color="var(--accent-primary)" />
                    <h2 style={{ margin: 0 }}>Listado de Proyectos: {filtro}</h2>
                </div>

                {loading ? (
                    <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="loader-spinner" /> Cargando...</div>
                ) : (
                    <div className="table-container">
                        <table>
                            <thead>
                                <tr>
                                    <th>ID Proyecto / Cliente</th>
                                    <th>Fecha Recepción</th>
                                    <th>Jefe Asignado</th>
                                    <th>Contrato</th>
                                    <th style={{ textAlign: 'right' }}>Acciones</th>
                                </tr>
                            </thead>
                            <tbody>
                                {proyectosMostrados.length === 0 ? (
                                    <tr><td colSpan="5">No hay proyectos en esta categoría.</td></tr>
                                ) : proyectosMostrados.map((pro, idx) => {
                                    const presupuesto = presupuestosMap[pro.Proyecto];
                                    return (
                                        <tr key={idx}>
                                            <td style={{ fontWeight: '600' }}>
                                                {getCleanProjectName(pro.Proyecto)}
                                                <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 'normal', marginTop: '2px' }}>
                                                    👤 Cliente: {pro.cliente || "No asignado"}
                                                </div>
                                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>ID: {pro.Proyecto}</div>
                                            </td>
                                            <td>{new Date(pro.fecha_recepcion).toLocaleDateString()}</td>
                                            <td>
                                                <span className="badge" style={{ backgroundColor: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db' }}>
                                                    {pro.jefe_obra || 'Sin Asignar'}
                                                </span>
                                            </td>
                                            <td>
                                                {presupuesto ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                        {getPresupuestoBadge(presupuesto)}
                                                        {presupuesto.precio_total && (
                                                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                                                {parseFloat(presupuesto.precio_total).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                                                            </span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Sin enviar</span>
                                                )}
                                            </td>
                                            <td style={{ textAlign: 'right' }}>
                                                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                                                    {presupuesto?.firma_base64 && (
                                                        <button className="btn btn-secondary btn-sm" onClick={() => setViendoFirma(presupuesto)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                            <Eye size={13} /> Firma
                                                        </button>
                                                    )}
                                                    {presupuesto?.estado === 'firmado' && (
                                                        <button className="btn btn-primary btn-sm" onClick={() => downloadSignedPDF(presupuesto)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                            <Download size={13} /> PDF Firmado
                                                        </button>
                                                    )}
                                                    {presupuesto?.estado === 'firmado' && (
                                                        <button className="btn btn-secondary btn-sm" onClick={() => downloadBC3(presupuesto)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                            <Download size={13} /> BC3
                                                        </button>
                                                    )}
                                                    {filtro === 'En Curso' ? (
                                                        <button className="btn btn-success btn-sm" onClick={() => handleFinalizarObra(pro)}>
                                                            Finalizar Obra
                                                        </button>
                                                    ) : (
                                                        <button className="btn btn-secondary btn-sm" onClick={() => handleReabrirObra(pro)}>
                                                            Reabrir
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal de confirmación normal */}
            {modalConfirm && (
                <Modal
                    title={modalConfirm.title}
                    icon={<CheckCircle size={30} color={modalConfirm.type === 'success' ? '#16a34a' : '#2563eb'} />}
                    iconBg={modalConfirm.type === 'success' ? 'rgba(22,163,74,0.1)' : 'rgba(37,99,235,0.1)'}
                    onClose={() => setModalConfirm(null)}
                    footer={
                        <BtnRow>
                            <button onClick={() => setModalConfirm(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                            <button onClick={modalConfirm.onConfirm} className="btn btn-success" style={{ flex: 1 }}>Confirmar</button>
                        </BtnRow>
                    }
                >
                    {modalConfirm.msg}
                </Modal>
            )}

            {/* Modal de advertencia (sin contrato firmado) */}
            {modalWarn && (
                <Modal
                    title={modalWarn.title}
                    icon={<AlertTriangle size={30} color="#d97706" />}
                    iconBg="rgba(245,158,11,0.1)"
                    onClose={() => setModalWarn(null)}
                    footer={
                        <BtnRow>
                            <button onClick={() => setModalWarn(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cancelar</button>
                            <button
                                onClick={modalWarn.onConfirm}
                                style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: '#d97706', color: 'white', fontWeight: 700, cursor: 'pointer' }}
                            >
                                Finalizar sin contrato
                            </button>
                        </BtnRow>
                    }
                >
                    {modalWarn.msg}
                </Modal>
            )}

            {/* Modal de firma */}
            {viendoFirma && (
                <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)', zIndex: 100000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: 'white', borderRadius: 20, padding: 36, maxWidth: 520, width: '90%', boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                            <div>
                                <h3 style={{ margin: 0 }}>Firma Digital</h3>
                                <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>{viendoFirma.cliente_nombre} — {viendoFirma.propuesta_id}</p>
                            </div>
                            <button onClick={() => setViendoFirma(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                                <X size={22} color="var(--text-muted)" />
                            </button>
                        </div>

                        <div style={{ background: 'var(--bg-secondary)', borderRadius: 12, padding: 12, marginBottom: 16 }}>
                            <img src={viendoFirma.firma_base64} alt="Firma del cliente" style={{ width: '100%', borderRadius: 8, border: '1px solid var(--border-color)' }} />
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(22,163,74,0.08)', borderRadius: 10, padding: '10px 14px', marginBottom: 20 }}>
                            <CheckCircle size={16} color="#16a34a" />
                            <span style={{ fontSize: '0.82rem', color: '#15803d' }}>
                                Firmado el {new Date(viendoFirma.fecha_firma).toLocaleString('es-ES')} · Total: {parseFloat(viendoFirma.precio_total || 0).toFixed(2)} €
                            </span>
                        </div>

                        <div style={{ display: 'flex', gap: 10 }}>
                            <button onClick={() => setViendoFirma(null)} className="btn btn-secondary" style={{ flex: 1 }}>Cerrar</button>
                            <button onClick={() => downloadSignedPDF(viendoFirma)} className="btn btn-primary" style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
                                <Download size={15} /> Descargar PDF Firmado
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Proyectos;
