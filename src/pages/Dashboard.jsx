import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { 
    Loader2, RefreshCw, Mailbox, Files, HardHat, Clock,
    CheckCircle, TrendingUp, FileCheck, AlertCircle, ArrowRight,
    Bot, User, History, Euro, Building2
, LayoutDashboard } from 'lucide-react';

// ─── Tarjeta KPI ──────────────────────────────────────────────────────────────
const KpiCard = ({ icon, label, value, color, bg, sublabel }) => (
    <div className="glass-card" style={{
        display: 'flex', alignItems: 'center', gap: 16,
        borderLeft: `4px solid ${color}`, padding: '18px 20px'
    }}>
        <div style={{
            width: 48, height: 48, borderRadius: 12,
            background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0
        }}>
            {icon}
        </div>
        <div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
            <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-muted)', marginTop: 4 }}>{label}</div>
            {sublabel && <div style={{ fontSize: '0.72rem', color: 'var(--text-light)', marginTop: 2 }}>{sublabel}</div>}
        </div>
    </div>
);

// ─── Pipeline visual ──────────────────────────────────────────────────────────
const PipelineBar = ({ stats }) => {
    const etapas = [
        { key: 'Pendiente',    label: 'Buzón',       color: '#6366f1', icon: '📬' },
        { key: 'Borrador',     label: 'Borradores',  color: '#f59e0b', icon: '✏️' },
        { key: 'En Revisión',  label: 'Revisión',    color: '#3b82f6', icon: '🔍' },
        { key: 'En Curso',     label: 'En Obra',     color: '#10b981', icon: '🏗️' },
        { key: 'Finalizado',   label: 'Terminados',  color: '#059669', icon: '✅' },
    ];
    const total = etapas.reduce((s, e) => s + (stats[e.key] || 0), 0) || 1;

    return (
        <div className="glass-card" style={{ padding: '20px 24px' }}>
            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                Pipeline de Proyectos
            </h3>
            <div style={{ display: 'flex', gap: 4, height: 44, borderRadius: 10, overflow: 'hidden' }}>
                {etapas.map((e, i) => {
                    const cnt = stats[e.key] || 0;
                    const pct = Math.max((cnt / total) * 100, cnt > 0 ? 5 : 0);
                    if (pct === 0) return null;
                    return (
                        <div key={e.key} title={`${e.label}: ${cnt}`} style={{
                            flex: `0 0 ${pct}%`, background: e.color,
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.7rem', color: 'white', fontWeight: 700,
                            transition: 'flex 0.5s ease', cursor: 'default',
                            minWidth: cnt > 0 ? 30 : 0,
                            borderRadius: i === 0 ? '8px 0 0 8px' : i === etapas.length - 1 ? '0 8px 8px 0' : 0
                        }}>
                            {cnt > 0 && (cnt >= 2 || pct > 8) ? `${e.icon} ${cnt}` : cnt > 0 ? cnt : ''}
                        </div>
                    );
                })}
            </div>
            <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                {etapas.map(e => (
                    <div key={e.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                        <div style={{ width: 10, height: 10, borderRadius: 3, background: e.color }} />
                        {e.label} ({stats[e.key] || 0})
                    </div>
                ))}
            </div>
        </div>
    );
};

// ─── Mini badge de origen ─────────────────────────────────────────────────────
const OrigenBadge = ({ origen }) => {
    const map = {
        'IA':                    { bg: 'rgba(168,85,247,0.12)', color: '#9333ea', icon: '🤖' },
        'Manual':                { bg: 'rgba(245,158,11,0.12)', color: '#d97706', icon: '✋' },
        'Histórico':             { bg: 'rgba(59,130,246,0.12)', color: '#2563eb', icon: '📚' },
        'Base ADIR':             { bg: 'rgba(0,45,84,0.12)',    color: '#002D54', icon: '📋' },
        'Manual (Jefe Obra)':    { bg: 'rgba(16,185,129,0.12)', color: '#059669', icon: '👷' },
        'Aceptación Presupuesto':{ bg: 'rgba(22,163,74,0.12)', color: '#16a34a', icon: '✅' },
    };
    const s = map[origen] || { bg: 'rgba(107,114,128,0.1)', color: '#6b7280', icon: '•' };
    return (
        <span style={{
            background: s.bg, color: s.color, padding: '2px 8px',
            borderRadius: 20, fontSize: '0.72rem', fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap'
        }}>
            {s.icon} {origen}
        </span>
    );
};

// ─── Componente principal ─────────────────────────────────────────────────────
const Dashboard = () => {
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState({});
    const [totalActivo, setTotalActivo] = useState(0);
    const [recientes, setRecientes] = useState([]);
    const [firmados, setFirmados] = useState([]);
    const [ultimaActualizacion, setUltimaActualizacion] = useState(null);

    const fetchDashboard = async () => {
        setLoading(true);
        try {
            // 1. Contar proyectos por estado
            const { data: propuestas } = await supabase
                .from('propuestas')
                .select('Proyecto, estado, cliente, precio_total, fecha_recepcion');

            const conteo = {};
            (propuestas || []).forEach(p => {
                conteo[p.estado] = (conteo[p.estado] || 0) + 1;
            });
            setStats(conteo);

            // 2. Total € en obras activas
            const proyectosActivos = (propuestas || [])
                .filter(p => p.estado === 'En Curso')
                .map(p => p.Proyecto);

            if (proyectosActivos.length > 0) {
                const { data: presupuestosActivos } = await supabase
                    .from('presupuestos_cliente')
                    .select('precio_total')
                    .in('propuesta_id', proyectosActivos);

                const total = (presupuestosActivos || []).reduce(
                    (s, p) => s + (parseFloat(p.precio_total) || 0), 0
                );
                setTotalActivo(total);
            }

            // 3. Últimos 6 cambios del historial
            const { data: historial } = await supabase
                .from('historial_cambios')
                .select('*')
                .order('fecha_cambio', { ascending: false })
                .limit(6);
            setRecientes(historial || []);

            // 4. Últimos presupuestos firmados o rechazados (max 4)
            const { data: pFirmados } = await supabase
                .from('presupuestos_cliente')
                .select('*')
                .in('estado', ['firmado', 'rechazado'])
                .order('fecha_firma', { ascending: false })
                .limit(4);
            setFirmados(pFirmados || []);

            setUltimaActualizacion(new Date());
        } catch (err) {
            console.error('Error cargando dashboard:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchDashboard(); }, []);

    const totalProyectos = Object.values(stats).reduce((s, v) => s + v, 0);

    return (
        <div className="animate-fade-in" style={{ paddingBottom: 40 }}>
            {/* ── Cabecera ── */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}><LayoutDashboard size={32} color="var(--primary)" /> Panel de Control</h1>
                    <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                        Resumen en tiempo real de todos los proyectos ADIR
                        {ultimaActualizacion && (
                            <span style={{ marginLeft: 10, fontSize: '0.75rem', color: 'var(--text-light)' }}>
                                · Actualizado {ultimaActualizacion.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                        )}
                    </p>
                </div>
                <button className="btn btn-secondary" onClick={fetchDashboard} disabled={loading}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <RefreshCw size={15} className={loading ? 'loader-spinner' : ''} /> Actualizar
                </button>
            </div>

            {loading ? (
                <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 200 }}>
                    <Loader2 className="loader-spinner" size={32} />
                </div>
            ) : (
                <>
                    {/* ── KPI Cards ── */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))',
                        gap: 14, marginBottom: 20
                    }}>
                        <KpiCard
                            icon={<Mailbox size={22} color="#6366f1" />}
                            label="En el Buzón"
                            value={stats['Pendiente'] || 0}
                            color="#6366f1"
                            bg="rgba(99,102,241,0.1)"
                            sublabel="Esperando revisión"
                        />
                        <KpiCard
                            icon={<Files size={22} color="#f59e0b" />}
                            label="Borradores"
                            value={stats['Borrador'] || 0}
                            color="#f59e0b"
                            bg="rgba(245,158,11,0.1)"
                            sublabel="En preparación"
                        />
                        <KpiCard
                            icon={<HardHat size={22} color="#3b82f6" />}
                            label="En Revisión"
                            value={stats['En Revisión'] || 0}
                            color="#3b82f6"
                            bg="rgba(59,130,246,0.1)"
                            sublabel="Pendiente Jefe Obra"
                        />
                        <KpiCard
                            icon={<Clock size={22} color="#10b981" />}
                            label="En Obra"
                            value={stats['En Curso'] || 0}
                            color="#10b981"
                            bg="rgba(16,185,129,0.1)"
                            sublabel={totalActivo > 0 ? `${totalActivo.toLocaleString('es-ES', { maximumFractionDigits: 0 })} € activos` : 'Sin contratos firmados'}
                        />
                        <KpiCard
                            icon={<CheckCircle size={22} color="#059669" />}
                            label="Finalizados"
                            value={stats['Finalizado'] || 0}
                            color="#059669"
                            bg="rgba(5,150,105,0.1)"
                            sublabel={`${totalProyectos} total`}
                        />
                    </div>

                    {/* ── Pipeline ── */}
                    <div style={{ marginBottom: 20 }}>
                        <PipelineBar stats={stats} />
                    </div>

                    {/* ── Dos columnas: actividad + firmados ── */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
                        gap: 20
                    }}>
                        {/* Actividad reciente */}
                        <div className="glass-card" style={{ padding: '20px 22px' }}>
                            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <History size={18} color="var(--primary)" /> Actividad Reciente
                            </h3>
                            {recientes.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
                                    Sin actividad registrada
                                </p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {recientes.map((log, i) => (
                                        <div key={log.id || i} style={{
                                            display: 'flex', flexDirection: 'column', gap: 4,
                                            paddingBottom: 10,
                                            borderBottom: i < recientes.length - 1 ? '1px solid var(--border-color)' : 'none'
                                        }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                                                <div style={{ fontWeight: 600, fontSize: '0.82rem', color: 'var(--text-main)', flex: 1 }}>
                                                    {log.proyecto_referencia || log.tipo_entidad}
                                                </div>
                                                <OrigenBadge origen={log.origen_cambio} />
                                            </div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ color: '#dc2626', textDecoration: 'line-through', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {(log.valor_anterior || '').split('|')[0]?.replace('PVP:', '').trim() || '–'}
                                                </span>
                                                <ArrowRight size={11} />
                                                <span style={{ color: '#16a34a', fontWeight: 700, maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {(log.valor_nuevo || '').split('|')[0]?.replace('PVP:', '').trim() || '–'}
                                                </span>
                                                <span style={{ marginLeft: 'auto', color: 'var(--text-light)', fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                                                    {log.fecha_cambio ? new Date(log.fecha_cambio).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Presupuestos firmados / rechazados */}
                        <div className="glass-card" style={{ padding: '20px 22px' }}>
                            <h3 style={{ margin: '0 0 16px', fontSize: '1rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
                                <FileCheck size={18} color="#16a34a" /> Últimas Respuestas de Clientes
                            </h3>
                            {firmados.length === 0 ? (
                                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', textAlign: 'center', padding: '20px 0' }}>
                                    Sin firmas o rechazos recientes
                                </p>
                            ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                    {firmados.map((f, i) => {
                                        const esFirmado = f.estado === 'firmado';
                                        return (
                                            <div key={f.id || i} style={{
                                                display: 'flex', alignItems: 'center', gap: 12,
                                                padding: '10px 12px', borderRadius: 10,
                                                background: esFirmado ? 'rgba(22,163,74,0.07)' : 'rgba(220,38,38,0.07)',
                                                border: `1px solid ${esFirmado ? 'rgba(22,163,74,0.2)' : 'rgba(220,38,38,0.2)'}`
                                            }}>
                                                <div style={{
                                                    width: 36, height: 36, borderRadius: 8, flexShrink: 0,
                                                    background: esFirmado ? 'rgba(22,163,74,0.15)' : 'rgba(220,38,38,0.15)',
                                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                                }}>
                                                    {esFirmado
                                                        ? <CheckCircle size={18} color="#16a34a" />
                                                        : <AlertCircle size={18} color="#dc2626" />}
                                                </div>
                                                <div style={{ flex: 1, minWidth: 0 }}>
                                                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--text-main)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {f.cliente_nombre || f.propuesta_id}
                                                    </div>
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: 1 }}>
                                                        {parseFloat(f.precio_total || 0).toLocaleString('es-ES', { maximumFractionDigits: 2 })} €
                                                        {f.fecha_firma && ` · ${new Date(f.fecha_firma).toLocaleDateString('es-ES')}`}
                                                    </div>
                                                </div>
                                                <span style={{
                                                    fontSize: '0.7rem', fontWeight: 700, padding: '3px 8px',
                                                    borderRadius: 20, whiteSpace: 'nowrap',
                                                    background: esFirmado ? '#dcfce7' : '#fee2e2',
                                                    color: esFirmado ? '#15803d' : '#991b1b'
                                                }}>
                                                    {esFirmado ? '✅ Firmado' : '❌ Rechazado'}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}

                            {/* Mini resumen */}
                            {firmados.length > 0 && (
                                <div style={{
                                    marginTop: 16, paddingTop: 14,
                                    borderTop: '1px solid var(--border-color)',
                                    display: 'flex', gap: 16, justifyContent: 'center'
                                }}>
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#16a34a' }}>
                                            {firmados.filter(f => f.estado === 'firmado').length}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Firmados</div>
                                    </div>
                                    <div style={{ width: 1, background: 'var(--border-color)' }} />
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#dc2626' }}>
                                            {firmados.filter(f => f.estado === 'rechazado').length}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Rechazados</div>
                                    </div>
                                    <div style={{ width: 1, background: 'var(--border-color)' }} />
                                    <div style={{ textAlign: 'center' }}>
                                        <div style={{ fontSize: '1.3rem', fontWeight: 800, color: '#002D54' }}>
                                            {firmados.filter(f => f.estado === 'firmado').reduce((s, f) => s + parseFloat(f.precio_total || 0), 0)
                                                .toLocaleString('es-ES', { maximumFractionDigits: 0 })} €
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>Facturado</div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default Dashboard;
