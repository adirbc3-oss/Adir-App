import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { N8N_BASE_URL } from '../config';
import { useModal, useToast } from '../utils/useModal';
import { 
  Loader2, RefreshCw, HardHat, FileText, ArrowLeft, CheckCircle, 
  X, AlertCircle, Trophy, User, Calendar, Briefcase 
} from 'lucide-react';
import { TODOS_LOS_OFICIOS } from '../utils/aiAllocation';

const JefesObra = () => {
    const { showAlert, ModalUI } = useModal();
    const { showToast, ToastUI } = useToast();

    const [proyectos, setProyectos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [jefeSeleccionado, setJefeSeleccionado] = useState('');
    const [jefesDisponibles, setJefesDisponibles] = useState([]);

    const [activeProject, setActiveProject] = useState(null);
    const [partidas, setPartidas] = useState([]);
    const [respuestasPorPartida, setRespuestasPorPartida] = useState({});
    const [loadingProject, setLoadingProject] = useState(false);
    const [showDenyModal, setShowDenyModal] = useState(false);
    const [showApproveWarning, setShowApproveWarning] = useState(false);
    
    const [showEditMetadata, setShowEditMetadata] = useState(false);
    const [metadataForm, setMetadataForm] = useState({ cliente: '', cliente_email: '', descripcion: '' });

    const fetchProyectos = React.useCallback(async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('propuestas')
                .select('*')
                .eq('estado', 'En Revisión');

            if (error) throw error;
            if (data) {
                setProyectos(data);
                // Extraer lista única de jefes de obra
                const jefes = [...new Set(data.map(p => p.jefe_obra).filter(Boolean))];
                setJefesDisponibles(jefes);
                // Solo auto-seleccionar si no hay ninguno
                if (jefes.length > 0 && !jefeSeleccionado) {
                    setJefeSeleccionado(jefes[0]);
                }
            }
        } catch (error) {
            console.error("Error fetching projects:", error);
            showToast("Error al cargar proyectos en revisión.", "error");
        } finally {
            setLoading(false);
        }
    }, [showToast]); // Eliminado jefeSeleccionado para evitar bucle infinito

    useEffect(() => {
        fetchProyectos();
    }, [fetchProyectos]);

    const formatCapitulo = (cap) => {
        if (!cap) return "";
        const s = cap.toString().trim();
        if (s.includes('T') && s.includes('-')) {
            const date = new Date(s);
            if (!isNaN(date)) {
                return `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, '0')}`;
            }
        }
        return s;
    };

    const openProject = async (project) => {
        setActiveProject(project);
        setLoadingProject(true);
        try {
            // 1. Cargar Partidas
            const { data: pData, error: pError } = await supabase
                .from('partidas')
                .select('*')
                .eq('propuesta_id', project.Proyecto);
            
            if (pError) throw pError;

            // 2. Cargar Respuestas (Precios de proveedores) para este proyecto
            const { data: rData, error: rError } = await supabase
                .from('respuestas')
                .select('*, solicitudes(proveedor_id, proveedor_nombre)')
                .in('partida_id', (pData || []).map(p => p.id));
            
            if (rError) console.warn("Error cargando respuestas:", rError);

            // Organizar respuestas por partida_id
            const respMap = {};
            (rData || []).forEach(r => {
                if (!respMap[r.partida_id]) respMap[r.partida_id] = [];
                respMap[r.partida_id].push({
                    ...r,
                    proveedor_nombre: r.solicitudes?.proveedor_nombre || 'Prov. Desconocido',
                    proveedor_id: r.solicitudes?.proveedor_id
                });
            });
            setRespuestasPorPartida(respMap);
            
            const mapped = (pData || []).map(p => {
                const capCode = p.texto_partida ? p.texto_partida.split('::')[0] : "";
                const descClean = p.texto_partida ? (p.texto_partida.includes('::') ? p.texto_partida.split('::').slice(1).join('::') : p.texto_partida) : "";
                const finalPrice = (p.precio_adjudicado && parseFloat(p.precio_adjudicado) > 0) 
                    ? parseFloat(p.precio_adjudicado) 
                    : (p.precio_base_estimado || 0);

                return {
                    ...p,
                    Capítulo: capCode,
                    Descripción: descClean,
                    "Precio Total (€)": finalPrice,
                    "Oficio Asignado": p.oficio_asignado || "Sin asignar",
                    Cantidad: p.cantidad !== undefined ? p.cantidad : 0,
                    "Unidad IA": p.unidad || "",
                    valor_anterior_precio: finalPrice,
                    valor_anterior_oficio_id: p.proveedor_adjudicado_id || null,
                    aprobado: false,
                    isModified: false,
                    solicitud_seleccionada_id: null // Para trackear selección manual
                };
            }).sort((a, b) => {
                const capA = formatCapitulo(a.Capítulo);
                const capB = formatCapitulo(b.Capítulo);

                const isRootA = capA.endsWith('##');
                const isRootB = capB.endsWith('##');
                if (isRootA && !isRootB) return -1;
                if (!isRootA && isRootB) return 1;

                const partsA = capA.split('.').map(x => parseInt(x.replace(/\D/g, '')) || 0);
                const partsB = capB.split('.').map(x => parseInt(x.replace(/\D/g, '')) || 0);

                const hasNumA = /\d/.test(capA);
                const hasNumB = /\d/.test(capB);
                if (!hasNumA && hasNumB) return 1;
                if (hasNumA && !hasNumB) return -1;

                for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
                    const valA = i < partsA.length ? partsA[i] : -1;
                    const valB = i < partsB.length ? partsB[i] : -1;
                    if (valA !== valB) return valA - valB;
                }
                // Si todo empata, la que termine en '#' va primero
                if (capA.endsWith('#') && !capB.endsWith('#')) return -1;
                if (!capA.endsWith('#') && capB.endsWith('#')) return 1;
                return 0;
            });
            
            setPartidas(mapped);
        } catch (err) {
            console.error(err);
            showAlert('Error cargando detalles del proyecto.', { type: 'error', title: 'Error' });
            setActiveProject(null);
        } finally {
            setLoadingProject(false);
        }
    };
    const openEditMetadata = () => {
        setMetadataForm({
            cliente: activeProject.cliente || activeProject.Proyecto.split('_')[0] || '',
            cliente_email: activeProject.direccion || ''
        });
        setShowEditMetadata(true);
    };

    const saveMetadata = async () => {
        try {
            const { error } = await supabase.from('propuestas')
                .update({
                    cliente: metadataForm.cliente,
                    direccion: metadataForm.cliente_email
                })
                .eq('Proyecto', activeProject.Proyecto);
                
            if (error) throw error;
            
            setActiveProject(prev => ({
                ...prev,
                cliente: metadataForm.cliente,
                direccion: metadataForm.cliente_email
            }));
            
            fetchProyectos(); // Refrescar lista de fondo
            setShowEditMetadata(false);
            showToast("Datos del proyecto actualizados", "success");
        } catch (err) {
            console.error(err);
            showToast("Error al guardar cambios del proyecto", "error");
        }
    };

    const denegarProyecto = async () => {
        setLoadingProject(true);
        try {
            const { error } = await supabase
                .from('propuestas')
                .update({ estado: 'Borrador' })
                .eq('Proyecto', activeProject.Proyecto);
                
            if (error) throw error;
            
            setShowDenyModal(false);
            showToast('❌ Proyecto denegado y devuelto a Borradores.', 'warning');
            setActiveProject(null);
            fetchProyectos();
        } catch (err) {
            console.error(err);
            showAlert('Error al denegar proyecto: ' + err.message, { type: 'error', title: 'Error' });
        } finally {
            setLoadingProject(false);
        }
    };

    const updatePrice = (idx, val) => {
        const copy = [...partidas];
        copy[idx]["Precio Total (€)"] = parseFloat(val) || 0;
        copy[idx].isModified = true;
        setPartidas(copy);
    };

    const updateOficio = (idx, val) => {
        const copy = [...partidas];
        copy[idx]["Oficio Asignado"] = val;
        copy[idx].isModified = true;
        setPartidas(copy);
    };

    const updateCantidad = (idx, val) => {
        const copy = [...partidas];
        copy[idx].Cantidad = val;
        copy[idx].isModified = true;
        setPartidas(copy);
    };

    const updateUnidad = (idx, val) => {
        const copy = [...partidas];
        copy[idx]["Unidad IA"] = val;
        copy[idx].isModified = true;
        setPartidas(copy);
    };

    const updateProveedor = (idx, solId) => {
        const copy = [...partidas];
        const partida = copy[idx];
        const resps = respuestasPorPartida[partida.id] || [];
        const selectedResp = resps.find(r => r.solicitud_id === solId);
        
        partida.proveedor_adjudicado_id = selectedResp ? selectedResp.proveedor_id : null;
        partida.solicitud_seleccionada_id = solId;
        partida.isModified = true;
        
        if (selectedResp) {
            partida["Precio Total (€)"] = selectedResp.precio_ofertado;
        }
        setPartidas(copy);
    };

    const toggleAprobado = (idx) => {
        const copy = [...partidas];
        copy[idx].aprobado = !copy[idx].aprobado;
        setPartidas(copy);
    };

    const toggleAllAprobado = () => {
        const partidasReales = partidas.filter(p => !(p.Capítulo && p.Capítulo.endsWith('#')));
        const allApproved = partidasReales.length > 0 && partidasReales.every(p => p.aprobado);
        
        const copy = partidas.map(p => {
            if (!(p.Capítulo && p.Capítulo.endsWith('#'))) {
                return { ...p, aprobado: !allApproved };
            }
            return p;
        });
        setPartidas(copy);
    };

    const handleConfirmarClick = () => {
        if (!activeProject.direccion || activeProject.direccion.trim() === '') {
            showAlert('Por favor, añade un correo electrónico de contacto (Editar Datos) antes de aprobar el proyecto. Este correo es necesario para enviar el presupuesto para firma.', { type: 'warning', title: 'Email Requerido' });
            return;
        }

        const noAprobadas = partidas.filter(p => !p.aprobado && !(p.Capítulo && p.Capítulo.endsWith('#')));
        if (noAprobadas.length > 0) {
            setShowApproveWarning(true);
        } else {
            confirmarProyecto();
        }
    };

    const confirmarProyecto = async () => {
        setLoadingProject(true);
        setShowApproveWarning(false);
        try {
            const updatePromises = partidas.filter(p => p.id).map(p => {
                const dataToUpdate = {
                    precio_base_estimado: parseFloat(p["Precio Total (€)"]) || 0,
                    precio_adjudicado: parseFloat(p["Precio Total (€)"]) || 0,
                    oficio_asignado: p["Oficio Asignado"] === "Sin asignar" ? null : p["Oficio Asignado"],
                    cantidad: parseFloat(p.Cantidad) || 0,
                    unidad: p["Unidad IA"] || null,
                    proveedor_adjudicado_id: p.proveedor_adjudicado_id || null,
                    estado_adjudicacion: p.proveedor_adjudicado_id ? 'Adjudicado' : null
                };
                return supabase.from('partidas').update(dataToUpdate).eq('id', p.id);
            });
            
            const results = await Promise.all(updatePromises);
            const hasError = results.find(r => r.error);
            if (hasError) throw hasError.error;

            // Generar logs de auditoría para los cambios del Jefe de Obra
            const logsAudit = partidas
                .filter(p => p.isModified)
                .map(p => ({
                    origen_cambio: 'Manual (Jefe Obra)',
                    tipo_entidad: 'Partida',
                    entidad_id: String(p.id),
                    proyecto_referencia: activeProject?.Proyecto || 'Sin Proyecto',
                    campo_modificado: 'Revisión Jefe Obra',
                    valor_anterior: `PVP: ${p.valor_anterior_precio ?? 0}€ | ProvID: ${p.valor_anterior_oficio_id || 'N/A'}`,
                    valor_nuevo: `PVP: ${p["Precio Total (€)"] || 0}€ | ProvID: ${p.proveedor_adjudicado_id || 'N/A'}`,
                    detalles: `Jefe de Obra: ${activeProject.jefe_obra} | ${p.Descripción}`
                }));

            if (logsAudit.length > 0) {
                await supabase.from('historial_cambios').insert(logsAudit);
            }

            const solUpdates = [];
            partidas.forEach(p => {
                if (p.solicitud_seleccionada_id) {
                    solUpdates.push(supabase.from('solicitudes').update({ estado: 'Adjudicada' }).eq('id', p.solicitud_seleccionada_id));
                }
            });
            if (solUpdates.length > 0) await Promise.all(solUpdates);

            const { error } = await supabase
                .from('propuestas')
                .update({ estado: 'En Curso' })
                .eq('Proyecto', activeProject.Proyecto);
                
            if (error) throw error;

            // ─── Crear presupuesto para cliente y enviar email ───
            const token = crypto.randomUUID();
            const precioTotal = partidas
                .filter(p => !p.Capítulo?.endsWith('#'))
                .reduce((acc, p) => acc + (parseFloat(p['Precio Total (€)']) || 0), 0);

            await supabase.from('presupuestos_cliente').insert({
                token,
                propuesta_id: activeProject.Proyecto,
                cliente_nombre: activeProject.cliente || activeProject.Proyecto,
                cliente_email: activeProject.direccion || '',
                proyecto_descripcion: activeProject.descripcion || activeProject.Proyecto,
                partidas: partidas,
                precio_total: precioTotal
            });

            const portalUrl = `${window.location.origin}/presupuesto-cliente?token=${token}`;

            // Construir tabla HTML del presupuesto para incluirla en el email
            const partidasEmail = partidas.filter(p => !p.Capítulo?.endsWith('#'));
            const filasHtml = partidasEmail.map((p, i) => `
                <tr style="background:${i % 2 === 0 ? '#e5edf7' : '#ffffff'};">
                    <td style="padding:10px 14px;font-size:13px;color:#334155;border-bottom:1px solid #c7d5e6;">
                        ${(p.Descripción || p.texto_partida || '-').replace(/</g, '&lt;').replace(/>/g, '&gt;')}
                    </td>
                    <td style="padding:10px 14px;font-size:13px;text-align:right;font-weight:600;color:#002D54;border-bottom:1px solid #c7d5e6;white-space:nowrap;">
                        ${parseFloat(p['Precio Total (€)'] || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                    </td>
                </tr>`).join('');

            const htmlPresupuesto = `
                <table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;margin:16px 0;">
                    <thead>
                        <tr style="background:#002D54;color:white;">
                            <th style="padding:11px 14px;text-align:left;font-size:13px;">Descripción</th>
                            <th style="padding:11px 14px;text-align:right;font-size:13px;width:130px;">Importe (€)</th>
                        </tr>
                    </thead>
                    <tbody>${filasHtml}</tbody>
                    <tfoot>
                        <tr style="background:#002D54;color:white;">
                            <td style="padding:12px 14px;font-weight:bold;font-size:15px;">TOTAL PRESUPUESTO</td>
                            <td style="padding:12px 14px;text-align:right;font-weight:bold;font-size:15px;white-space:nowrap;">
                                ${precioTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €
                            </td>
                        </tr>
                    </tfoot>
                </table>`;

            // Sanitizar HTML: comillas dobles → simples, colapsar whitespace (seguro para JSON)
            const htmlPresupuestoSafe = htmlPresupuesto.replace(/"/g, "'").replace(/\s+/g, ' ').trim();

            // Fire-and-forget: no esperamos respuesta de n8n para no bloquear la UI
            fetch(`${N8N_BASE_URL}/webhook/presupuesto-cliente`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    cliente_email: activeProject.direccion || '',
                    cliente_nombre: activeProject.cliente || activeProject.Proyecto,
                    proyecto: activeProject.Proyecto,
                    precio_total: precioTotal,
                    portal_url: portalUrl,
                    html_presupuesto: htmlPresupuestoSafe
                })
            }).catch(e => console.warn('n8n no disponible, email no enviado:', e));

            showAlert(`✅ Proyecto aprobado y en curso.\n\n📧 Presupuesto enviado al cliente.\n\n🔗 Enlace:\n${portalUrl}`, { type: 'success', title: '¡Proyecto Aprobado!' });
            setActiveProject(null);
            fetchProyectos();
        } catch (err) {
            console.error(err);
            showAlert('Error al confirmar proyecto: ' + err.message, { type: 'error', title: 'Error' });
        } finally {
            setLoadingProject(false);
        }
    };

    const proyectosFiltrados = jefeSeleccionado 
        ? proyectos.filter(p => p.jefe_obra === jefeSeleccionado)
        : proyectos;

    return (
        <div>
            {ModalUI}
            {ToastUI}
            <div className="animate-fade-in">
                {activeProject ? (
                    /* ─── VISTA DETALLE DEL PROYECTO ─── */
                    <div style={{ paddingBottom: '40px' }}>
                        <div className="glass-card" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                                <button className="btn btn-secondary" onClick={() => setActiveProject(null)} style={{ padding: '8px', borderRadius: '50%' }}>
                                    <ArrowLeft size={18} />
                                </button>
                                <div>
                                    <h1 style={{ margin: 0, fontSize: '1.4rem', display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        {activeProject.cliente || activeProject.Proyecto.split('_')[0]}
                                        <button className="btn btn-secondary btn-sm" onClick={openEditMetadata} title="Editar Datos del Proyecto" style={{ padding: '4px 8px', fontSize: '0.75rem', fontWeight: 600 }}>
                                            ✏️ Editar Datos
                                        </button>
                                    </h1>
                                    <span className="badge badge-blue">Revisión de Jefe de Obra</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px' }}>
                                <button 
                                    className="btn btn-secondary" 
                                    onClick={() => setShowDenyModal(true)} 
                                    disabled={loadingProject} 
                                    style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }}
                                >
                                    Denegar y Devolver
                                </button>
                                <button className="btn btn-success" onClick={handleConfirmarClick} disabled={loadingProject} style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                    {loadingProject ? <Loader2 className="loader-spinner" size={16} /> : <CheckCircle size={16} />}
                                    Aprobar y Empezar Obra
                                </button>
                            </div>
                        </div>

                        {!loadingProject && partidas.length > 0 && (
                            <div style={{
                                position: 'sticky', bottom: 0, zIndex: 10,
                                background: 'var(--bg-card)', borderTop: '2px solid var(--primary)',
                                padding: '14px 24px', borderRadius: '0 0 16px 16px',
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                boxShadow: '0 -4px 20px rgba(0,0,0,0.1)', marginBottom: '8px'
                            }}>
                                <span style={{ fontWeight: 600, color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
                                    Total presupuesto ({partidas.filter(p => !p.Capítulo?.endsWith('#')).length} partidas)
                                </span>
                                <span style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--primary)' }}>
                                    {partidas
                                        .filter(p => !p.Capítulo?.endsWith('#'))
                                        .reduce((acc, p) => acc + (parseFloat(p['Precio Total (€)']) || 0), 0)
                                        .toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                </span>
                            </div>
                        )}

                        <div className="glass-card">
                            {loadingProject ? (
                                <div style={{ textAlign: 'center', padding: '40px' }}><Loader2 className="loader-spinner" size={32} /></div>
                            ) : (
                                <div className="table-container">
                                    <table style={{ borderCollapse: 'collapse' }}>
                                        <thead>
                                            <tr>
                                                <th style={{ width: '50px', textAlign: 'center' }}>
                                                    <input 
                                                        type="checkbox" 
                                                        onChange={toggleAllAprobado} 
                                                        checked={partidas.filter(p => !(p.Capítulo && p.Capítulo.endsWith('#'))).length > 0 && partidas.filter(p => !(p.Capítulo && p.Capítulo.endsWith('#'))).every(p => p.aprobado)}
                                                        style={{ transform: 'scale(1.2)', cursor: 'pointer' }} 
                                                        title="Marcar / Desmarcar todas"
                                                    />
                                                </th>
                                                <th>Capítulo</th>
                                                <th>Descripción</th>
                                                <th style={{ width: '60px', textAlign: 'center' }}>Cant.</th>
                                                <th style={{ width: '70px', textAlign: 'center' }}>Ud.</th>
                                                <th style={{ width: '130px' }}>Oficio</th>
                                                <th>Proveedor / Oferta</th>
                                                <th style={{ textAlign: 'right' }}>Coste Final (€)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {partidas.map((p, idx) => {
                                                const isChapter = p.Capítulo && p.Capítulo.endsWith('#');
                                                const capClean = isChapter ? p.Capítulo.replace(/#+/g, '') : formatCapitulo(p.Capítulo);
                                                
                                                return (
                                                    <tr key={idx} style={{ backgroundColor: isChapter ? 'var(--bg-secondary)' : (p.aprobado ? 'rgba(22, 163, 74, 0.05)' : 'transparent'), fontWeight: isChapter ? 'bold' : 'normal' }}>
                                                        <td style={{ textAlign: 'center' }}>
                                                            {!isChapter && (
                                                                <input type="checkbox" checked={p.aprobado} onChange={() => toggleAprobado(idx)} style={{ transform: 'scale(1.2)', cursor: 'pointer' }} />
                                                            )}
                                                        </td>
                                                        <td style={{ color: 'var(--accent-primary)', fontWeight: 'bold' }}>{capClean}</td>
                                                        <td style={{ fontSize: '0.85rem' }}>{p.Descripción}</td>
                                                        <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>
                                                            {isChapter ? '' : (
                                                                <input 
                                                                    type="number" step="0.01" 
                                                                    value={p.Cantidad !== undefined ? p.Cantidad : ''}
                                                                    onChange={(e) => updateCantidad(idx, e.target.value)}
                                                                    style={{ width: '60px', textAlign: 'center', padding: '4px', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: 'var(--bg-card)' }}
                                                                />
                                                            )}
                                                        </td>
                                                        <td style={{ textAlign: 'center', fontSize: '0.8rem' }}>
                                                            {isChapter ? '' : (
                                                                <input 
                                                                    type="text" 
                                                                    value={p['Unidad IA'] || ''}
                                                                    onChange={(e) => updateUnidad(idx, e.target.value)}
                                                                    style={{ width: '50px', textAlign: 'center', padding: '4px', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: 'var(--bg-card)' }}
                                                                />
                                                            )}
                                                        </td>
                                                        <td style={{ fontSize: '0.8rem' }}>
                                                            {isChapter ? '' : (
                                                                <select 
                                                                    style={{ width: '100%', padding: '4px', borderRadius: '4px', fontSize: '0.75rem', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
                                                                    onChange={(e) => updateOficio(idx, e.target.value)}
                                                                    value={p["Oficio Asignado"] || ''}
                                                                >
                                                                    <option value="Sin asignar">Sin asignar</option>
                                                                    {TODOS_LOS_OFICIOS.map(of => (
                                                                        <option key={of} value={of}>{of}</option>
                                                                    ))}
                                                                </select>
                                                            )}
                                                        </td>
                                                        <td style={{ fontSize: '0.8rem' }}>
                                                            {isChapter ? '' : (
                                                                <select 
                                                                    style={{ width: '100%', padding: '4px', borderRadius: '4px', fontSize: '0.75rem' }}
                                                                    onChange={(e) => updateProveedor(idx, e.target.value)}
                                                                    value={p.solicitud_seleccionada_id || ''}
                                                                >
                                                                    <option value="">-- Usar precio base --</option>
                                                                    {(respuestasPorPartida[p.id] || []).map(r => (
                                                                        <option key={r.solicitud_id} value={r.solicitud_id}>
                                                                            {r.proveedor_nombre} ({r.precio_ofertado}€)
                                                                        </option>
                                                                    ))}
                                                                </select>
                                                            )}
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            {isChapter ? '' : (
                                                                <input 
                                                                    type="number" step="0.01" 
                                                                    value={p['Precio Total (€)']}
                                                                    onChange={(e) => updatePrice(idx, e.target.value)}
                                                                    style={{ width: '90px', textAlign: 'right', padding: '6px', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: 'var(--bg-card)' }}
                                                                />
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                ) : (
                    /* ─── VISTA LISTADO DE PROYECTOS ─── */
                    <>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <h1>Panel de Jefes de Obra</h1>
                            <button className="btn btn-secondary" onClick={fetchProyectos} disabled={loading}>
                                <RefreshCw size={16} className={loading ? 'loader-spinner' : ''} />
                            </button>
                        </div>

                        <div className="glass-card" style={{ marginTop: '24px', marginBottom: '24px' }}>
                            <h3>👤 Selecciona tu perfil</h3>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '15px' }}>
                                Filtra los proyectos que tienes asignados para revisión.
                            </p>
                            <select 
                                value={jefeSeleccionado} 
                                onChange={(e) => setJefeSeleccionado(e.target.value)}
                                style={{ width: '100%', maxWidth: '300px', padding: '10px', borderRadius: 'var(--radius-md)' }}
                            >
                                <option value="">-- Todos los Jefes de Obra --</option>
                                {jefesDisponibles.map(jefe => (
                                    <option key={jefe} value={jefe}>{jefe}</option>
                                ))}
                            </select>
                        </div>

                        <div className="glass-card">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
                                <HardHat size={24} color="var(--accent-primary)" />
                                <h2 style={{ margin: 0 }}>Proyectos Pendientes de Revisión</h2>
                            </div>
                            
                            {loading ? (
                                <div style={{ padding: '40px', textAlign: 'center' }}>
                                    <Loader2 className="loader-spinner" /> Cargando...
                                </div>
                            ) : (
                                <div className="table-container">
                                    <table>
                                        <thead>
                                            <tr>
                                                <th>ID Proyecto / Cliente</th>
                                                <th>Fecha Recepción</th>
                                                <th>Jefe Asignado</th>
                                                <th style={{ textAlign: 'right' }}>Acciones</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {proyectosFiltrados.length === 0 ? (
                                                <tr><td colSpan="4">No hay proyectos asignados a este perfil.</td></tr>
                                            ) : (
                                                proyectosFiltrados.map((pro, idx) => (
                                                    <tr key={idx}>
                                                        <td style={{ fontWeight: '600' }}>
                                                            {pro.cliente || (pro.Proyecto || "").split('_')[0]}
                                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 'normal' }}>
                                                                ID: {pro.Proyecto}
                                                            </div>
                                                        </td>
                                                        <td>{new Date(pro.fecha_recepcion).toLocaleDateString()}</td>
                                                        <td>
                                                            <span className="badge" style={{ backgroundColor: '#e5edf7', color: '#002D54', border: '1px solid #c7d5e6' }}>
                                                                {pro.jefe_obra || 'Sin Asignar'}
                                                            </span>
                                                        </td>
                                                        <td style={{ textAlign: 'right' }}>
                                                            <button className="btn btn-primary btn-sm" onClick={() => openProject(pro)} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                                                                <FileText size={14} /> Evaluar
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* ─── MODALES (FUERA del div animado para asegurar el centrado en pantalla completa) ─── */}
            {showDenyModal && (
                <div style={modalOverlay}>
                    <div style={modalContent}>
                        <div style={{ width: '60px', height: '60px', background: '#fee2e2', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                            <X size={30} color="#dc2626" />
                        </div>
                        <h3 style={{ margin: '0 0 10px', fontSize: '1.25rem', color: '#111827' }}>¿Denegar Proyecto?</h3>
                        <p style={{ margin: '0 0 24px', fontSize: '0.95rem', color: '#6b7280', lineHeight: 1.5 }}>
                            El proyecto volverá a la sección de <strong>Borradores</strong>. Oficina podrá editarlo de nuevo y ajustar precios o proveedores.
                        </p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => setShowDenyModal(false)} style={btnCancel}>Cancelar</button>
                            <button onClick={denegarProyecto} style={btnDanger}>Confirmar y Devolver</button>
                        </div>
                    </div>
                </div>
            )}

            {showApproveWarning && (
                <div style={modalOverlay}>
                    <div style={modalContent}>
                        <div style={{ width: '60px', height: '60px', background: '#fef3c7', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                            <AlertCircle size={30} color="#d97706" />
                        </div>
                        <h3 style={{ margin: '0 0 10px', fontSize: '1.25rem', color: '#111827' }}>Partidas sin revisar</h3>
                        <p style={{ margin: '0 0 24px', fontSize: '0.95rem', color: '#6b7280', lineHeight: 1.5 }}>
                            Tienes algunas partidas sin marcar como revisadas (OK). ¿Deseas aprobar el proyecto de todas formas?
                        </p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button onClick={() => setShowApproveWarning(false)} style={btnCancel}>Seguir Revisando</button>
                            <button onClick={confirmarProyecto} style={btnSuccess}>Aprobar de todas formas</button>
                        </div>
                    </div>
                </div>
            )}

            {showEditMetadata && (
                <div style={modalOverlay}>
                    <div style={{...modalContent, textAlign: 'left', maxWidth: '450px'}}>
                        <h3 style={{ color: 'var(--accent-primary)', marginBottom: '15px' }}>✏️ Editar Datos del Proyecto</h3>
                        
                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', fontWeight: 600 }}>Nombre del Cliente / Título:</label>
                            <input 
                                type="text" 
                                value={metadataForm.cliente} 
                                onChange={(e) => setMetadataForm({...metadataForm, cliente: e.target.value})}
                                style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                            />
                        </div>
                        
                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', fontWeight: 600 }}>Email de Contacto (Para firma digital):</label>
                            <input 
                                type="email" 
                                value={metadataForm.cliente_email} 
                                onChange={(e) => setMetadataForm({...metadataForm, cliente_email: e.target.value})}
                                placeholder="ejemplo@correo.com"
                                style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
                            />
                        </div>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => setShowEditMetadata(false)}>Cancelar</button>
                            <button className="btn btn-primary" onClick={saveMetadata}>Guardar Cambios</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const modalOverlay = {
    position: 'fixed', 
    top: 0, 
    left: 0, 
    width: '100vw', 
    height: '100vh',
    backgroundColor: 'rgba(0,0,0,0.6)', 
    backdropFilter: 'blur(8px)',
    zIndex: 1000000, 
    display: 'flex', 
    justifyContent: 'center', 
    alignItems: 'center'
};
const modalContent = {
    background: 'white', 
    padding: '40px', 
    borderRadius: '24px',
    maxWidth: '460px', 
    width: '90%', 
    textAlign: 'center',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
    position: 'relative',
    // Aseguramos que sea el centro de la ventana
    margin: 'auto'
};
const btnCancel = { flex: 1, padding: '12px', borderRadius: '10px', border: '1px solid #c7d5e6', background: 'white', fontWeight: 600, cursor: 'pointer' };
const btnDanger = { flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#dc2626', color: 'white', fontWeight: 600, cursor: 'pointer' };
const btnSuccess = { flex: 1, padding: '12px', borderRadius: '10px', border: 'none', background: '#16a34a', color: 'white', fontWeight: 600, cursor: 'pointer' };

export default JefesObra;
