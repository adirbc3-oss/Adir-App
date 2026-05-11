import React, { useState, useEffect } from 'react';
import { N8N_BASE_URL } from '../config';
import { supabase } from '../utils/supabaseClient';
import { useModal, useToast } from '../utils/useModal';
import { Loader2, Bot, ArrowLeft, Save, Trash2, Send, RefreshCw, Mail, Search, FileDown, ClipboardCheck } from 'lucide-react';
import { asignarProveedoresIA, TODOS_LOS_OFICIOS } from '../utils/aiAllocation';
import { generarPresupuestoPDF, descargarPDF } from '../utils/pdfUtils';

const Borradores = ({ sessionCache = {}, setSessionCache }) => {
    const { showConfirm, ModalUI } = useModal();
    const { showToast, ToastUI } = useToast();

    const [proyectos, setProyectos] = useState([]);
    const [loading, setLoading] = useState(true);

    // Vista detallada de proyecto
    const [activeProject, setActiveProject] = useState(null);
    const [partidas, setPartidas] = useState([]);
    const [proveedores, setProveedores] = useState([]);
    const [loadingProject, setLoadingProject] = useState(false);
    const [saving, setSaving] = useState(false);

    // Estado de la IA y Módulos Avanzados
    const [aiLoading, setAiLoading] = useState(false);
    const [aiProgress, setAiProgress] = useState(0);
    const [histLoading, setHistLoading] = useState(false);

    const [selectedOficio, setSelectedOficio] = useState("");
    const [sendingEmails, setSendingEmails] = useState(false);
    const [selectedProviders, setSelectedProviders] = useState({});

    const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
    const [projectToDelete, setProjectToDelete] = useState(null);

    const [showReviewModal, setShowReviewModal] = useState(false);
    const [jefeInput, setJefeInput] = useState('');
    
    // Estados para edición de metadatos del proyecto
    const [showEditMetadata, setShowEditMetadata] = useState(false);
    const [metadataForm, setMetadataForm] = useState({ cliente: '', cliente_email: '', descripcion: '' });

    // Sincronizar cambios locales con la memoria de sesión global
    useEffect(() => {
        if (activeProject && setSessionCache) {
            setSessionCache(prev => ({
                ...prev,
                [activeProject.Proyecto]: {
                    partidas: partidas,
                    hasUnsavedChanges: hasUnsavedChanges
                }
            }));
        }
    }, [partidas, hasUnsavedChanges, activeProject, setSessionCache]);



    const fetchProyectos = React.useCallback(async (force = false) => {
        if (!force && proyectos.length > 0 && !loading) return;
        setLoading(true);
        try {
            const { data, error } = await supabase.from('propuestas').select('*').eq('estado', 'Borrador');
            if (error) throw error;
            if (data) {
                setProyectos(data);
            }
        } catch (error) {
            console.error("Error fetching project list:", error);
            showToast("Error de conexión con la base de datos.", "error");
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchProyectos();
    }, [fetchProyectos]);

    const confirmDelete = async (project) => {
        setLoading(true);
        try {
            console.log("Iniciando borrado verificado de proyecto:", project.Proyecto);
            
            // 1. Borrar de solicitudes si las hubiera
            await supabase.from('solicitudes').delete().eq('propuesta_id', project.Proyecto);

            // 2. Borrar partidas
            await supabase.from('partidas').delete().eq('propuesta_id', project.Proyecto);

            // 3. Borrar propuesta maestra y VERIFICAR
            const { error, count } = await supabase
                .from('propuestas')
                .delete({ count: 'exact' })
                .eq('Proyecto', project.Proyecto);

            if (error) throw error;
            
            if (count === 0) {
                throw new Error("No se pudo borrar de la base de datos (posible restricción de permisos RLS).");
            }

            showToast(`Proyecto "${project.cliente || project.Proyecto}" eliminado correctamente.`);
            fetchProyectos(true);
        } catch (error) {
            console.error("Error de borrado:", error);
            showToast("Error de borrado: " + (error.message || "Desconocido"), 'error');
        } finally {
            setLoading(false);
        }
    };

    const formatCapitulo = (cap) => {
        if (!cap) return "";
        const s = cap.toString().trim();
        if (s.includes('T') && s.includes('-')) {
            const date = new Date(s);
            if (!isNaN(date)) {
                const month = date.getMonth() + 1;
                const day = String(date.getDate()).padStart(2, '0');
                return `${month}.${day}`;
            }
        }
        return s;
    };

    const openEditMetadata = () => {
        if (!activeProject) return;
        setMetadataForm({
            cliente: activeProject.cliente || (activeProject.Proyecto || "").split('_')[0] || '',
            cliente_email: activeProject.direccion || ''
        });
        setShowEditMetadata(true);
    };

    const saveMetadata = async () => {
        if (!activeProject) return;
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
            
            fetchProyectos(true); 
            setShowEditMetadata(false);
            showToast("Datos del proyecto actualizados", "success");
        } catch (err) {
            console.error(err);
            showToast("Error al guardar cambios del proyecto", "error");
        }
    };

    const openProject = async (project) => {
        setActiveProject(project);
        setLoadingProject(true);
        setSelectedOficio("");
        setSelectedProviders({});

        if (sessionCache[project.Proyecto]) {
            setPartidas(sessionCache[project.Proyecto].partidas);
            setHasUnsavedChanges(sessionCache[project.Proyecto].hasUnsavedChanges || false);
            setLoadingProject(false);
            
            supabase.from('proveedores').select('*').then(({ data: provData }) => {
                if (provData) setProveedores(provData.map(p => ({
                    id: p.id, Nombre: p.nombre_empresa, Oficio: p.oficio_principal,
                    Email: p.email, Telefono: p.telefono
                })));
            });
            fetchRespuestas(project.Proyecto);
            return;
        }

        try {
            const [{ data: partidasData }, { data: provData }] = await Promise.all([
                supabase.from('partidas').select('*').eq('propuesta_id', project.Proyecto),
                supabase.from('proveedores').select('*')
            ]);

            if (provData) {
                const formattedProv = provData.map(p => ({
                    id: p.id, Nombre: p.nombre_empresa, Oficio: p.oficio_principal,
                    Email: p.email, Telefono: p.telefono
                }));
                setProveedores(formattedProv);
            }

            if (partidasData) {
                const mappedPartidas = partidasData.map(p => {
                    const capCode = p.texto_partida ? p.texto_partida.split('::')[0] : "";
                    const descClean = p.texto_partida ? (p.texto_partida.includes('::') ? p.texto_partida.split('::').slice(1).join('::') : p.texto_partida) : "";
                    const finalPrice = (p.precio_adjudicado && parseFloat(p.precio_adjudicado) > 0) 
                        ? parseFloat(p.precio_adjudicado) 
                        : (p.precio_base_estimado || 0);

                    const needsQuote = (!finalPrice || finalPrice === 0);

                    return {
                        ...p,
                        Capítulo: capCode,
                        Descripción: descClean,
                        "Oficio Asignado": p.oficio_asignado || "Sin asignar",
                        "Precio Total (€)": finalPrice,
                        Cantidad: p.cantidad || 0,
                        "Precio IA": p.precio_ia || 0,
                        "Unidad IA": p.unidad || "",
                        "Needs Quote": p.force_quote !== undefined ? p.force_quote : needsQuote
                    };
                });
                const sorted = mappedPartidas.sort((a, b) => {
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
                    if (capA.endsWith('#') && !capB.endsWith('#')) return -1;
                    if (!capA.endsWith('#') && capB.endsWith('#')) return 1;
                    return 0;
                });
                setPartidas(sorted);
                fetchRespuestas();
            }
        } catch (error) {
            console.error("Error cargando proyecto", error);
            showToast("Error al obtener los detalles del proyecto.", 'error');
            setActiveProject(null);
        } finally {
            setLoadingProject(false);
            setHasUnsavedChanges(false);
        }
    };

    const fetchRespuestas = React.useCallback(async () => {
        if (!activeProject || (partidas || []).length === 0) return;
        try {
            const { data: respuestasPartidas, error } = await supabase
                .from('respuestas')
                .select('*')
                .in('partida_id', partidas.map(p => p.id));
            if (error) throw error;
        } catch (err) {
            console.error("Error fetching responses:", err);
        }
    }, [activeProject, partidas]);

    const saveAssignments = async () => {
        setSaving(true);
        try {
            const updatePromises = partidas
                .filter(p => p.id)
                .map(p =>
                    supabase.from('partidas').update({
                        precio_base_estimado: parseFloat(p["Precio Total (€)"]) || 0,
                        oficio_asignado: p["Oficio Asignado"] === "Sin asignar" ? null : p["Oficio Asignado"],
                        precio_ia: parseFloat(p["Precio IA"]) || null,
                        unidad: p["Unidad IA"] || null,
                        cantidad: parseFloat(p.Cantidad) || 0,
                        force_quote: p["Needs Quote"] || false
                    }).eq('id', p.id)
                );

            const results = await Promise.all(updatePromises);
            const hasError = results.find(r => r.error);

            if (!hasError) {
                const logsAudit = partidas
                    .filter(p => p.isModified)
                    .map(p => ({
                        origen_cambio: p.origen_modificacion || 'Manual',
                        tipo_entidad: 'Partida',
                        entidad_id: String(p.id),
                        proyecto_referencia: activeProject?.Proyecto || 'Sin Proyecto',
                        campo_modificado: 'Precio / Oficio',
                        valor_anterior: `PVP: ${p.valor_anterior_precio ?? 0}€ | Oficio: ${p.valor_anterior_oficio || 'Sin asignar'}`,
                        valor_nuevo: `PVP: ${p["Precio Total (€)"] || 0}€ | Oficio: ${p["Oficio Asignado"] || 'Sin asignar'}`,
                        detalles: p.Descripción || p.texto_partida || ''
                    }));
                if (logsAudit.length > 0) await supabase.from('historial_cambios').insert(logsAudit);
                showToast(`✅ ${updatePromises.length} partidas guardadas.`);
                setPartidas(prev => prev.map(p => ({ ...p, isModified: false, origen_modificacion: null })));
                setHasUnsavedChanges(false);
                return true;
            } else {
                showToast("Error al guardar partidas: " + hasError.error.message, 'error');
                return false;
            }
        } catch (err) {
            showToast("Error de conexión al guardar cambios.", 'error');
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleHistoricalAssign = async () => {
        setHistLoading(true);
        try {
            const codigosActuales = partidas
                .map(p => p.texto_partida ? p.texto_partida.split('::')[0].trim() : "")
                .filter(c => c && !c.includes('#'));
            const { data: baseData, error: baseError } = await supabase
                .from('base_precios_adir')
                .select('codigo, precio_total')
                .in('codigo', codigosActuales);
            const adirBaseMap = new Map();
            if (!baseError && baseData) baseData.forEach(item => adirBaseMap.set(item.codigo, item.precio_total));

            const oneYearAgo = new Date();
            oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
            const { data: propData, error: propError } = await supabase
                .from('propuestas')
                .select('Proyecto')
                .gte('fecha_recepcion', oneYearAgo.toISOString().split('T')[0])
                .neq('Proyecto', activeProject.Proyecto);

            let historyMap = new Map();
            if (!propError && propData && propData.length > 0) {
                const { data: partData, error: partError } = await supabase
                    .from('partidas')
                    .select('texto_partida, precio_adjudicado, precio_base_estimado')
                    .in('propuesta_id', propData.map(p => p.Proyecto));
                if (!partError && partData) {
                    partData.forEach(p => {
                        const price = p.precio_adjudicado > 0 ? parseFloat(p.precio_adjudicado) : (p.precio_base_estimado > 0 ? parseFloat(p.precio_base_estimado) : 0);
                        if (price > 0) historyMap.set(p.texto_partida, price);
                    });
                }
            }

            let aplicadasAdir = 0, aplicadasHist = 0;
            const newPartidas = partidas.map(p => {
                if (p.Capítulo && p.Capítulo.match(/#+$/)) return p;
                const codigo = p.texto_partida ? p.texto_partida.split('::')[0].trim() : "";
                const precioAdir = adirBaseMap.get(codigo);
                if (precioAdir && precioAdir > 0) {
                    aplicadasAdir++;
                    return { ...p, "Precio Total (€)": precioAdir, isModified: true, origen_modificacion: 'Base ADIR' };
                }
                const precioHist = historyMap.get(p.texto_partida);
                if (precioHist && precioHist > 0) {
                    aplicadasHist++;
                    return { ...p, "Precio Total (€)": precioHist, isModified: true, origen_modificacion: 'Histórico' };
                }
                return p;
            });
            if (aplicadasAdir > 0 || aplicadasHist > 0) {
                setPartidas(newPartidas);
                setHasUnsavedChanges(true);
                showToast(`✅ Aplicados ${aplicadasAdir} de Base ADIR y ${aplicadasHist} de históricos.`);
            } else showToast('No se encontraron coincidencias.', 'warning');
        } catch (error) { showToast('Error al buscar precios.', 'error'); }
        finally { setHistLoading(false); }
    };

    const handleAI = async () => {
        setAiLoading(true);
        setAiProgress(5);
        try {
            const resultado = await asignarProveedoresIA(partidas, proveedores, (prog) => { 
                if (prog.progress) setAiProgress(prog.progress);
            });
            let aplicadas = 0;
            const nuevasPartidas = partidas.map(p => {
                if (p.Capítulo && p.Capítulo.endsWith('#')) return p;
                const info = resultado.asignaciones[p.Capítulo];
                if (info && info.oficio && info.oficio !== "Sin asignar") {
                    aplicadas++;
                    return { ...p, "Oficio Asignado": info.oficio, "Precio IA": info.precio || 0, "Unidad IA": info.unidad || "ud", isModified: true, origen_modificacion: 'IA' };
                }
                return p;
            });
            if (aplicadas > 0) {
                setPartidas(nuevasPartidas);
                setHasUnsavedChanges(true);
                showToast(`✅ IA completada: ${aplicadas} partidas.`);
            } else showToast("IA no encontró tareas.", 'warning');
        } catch (err) { showToast("Error en IA: " + err.message, 'error'); }
        finally { setAiLoading(false); setAiProgress(0); }
    };

    const toggleNeedsQuote = (idx) => {
        const copy = [...partidas];
        copy[idx]["Needs Quote"] = !copy[idx]["Needs Quote"];
        setPartidas(copy);
        setHasUnsavedChanges(true);
    };

    const updatePrice = (idx, newVal) => {
        const copy = [...partidas];
        const val = parseFloat(newVal) || 0;
        copy[idx]["Precio Total (€)"] = val;
        copy[idx].isModified = true;
        copy[idx].origen_modificacion = 'Manual';
        setPartidas(copy);
        setHasUnsavedChanges(true);
    };

    const updateUnidad = (idx, newVal) => {
        const copy = [...partidas];
        copy[idx]["Unidad IA"] = newVal;
        copy[idx].isModified = true;
        setPartidas(copy);
        setHasUnsavedChanges(true);
    };

    const updateCantidad = (idx, newVal) => {
        const copy = [...partidas];
        copy[idx].Cantidad = newVal;
        copy[idx].isModified = true;
        setPartidas(copy);
        setHasUnsavedChanges(true);
    };

    const handleRequestQuotes = async () => {
        if (hasUnsavedChanges) await saveAssignments();
        const provs = proveedores.filter(p => p.Oficio === selectedOficio && selectedProviders[p.Nombre]);
        if (provs.length === 0) return showToast("Selecciona proveedores.", "warning");
        const tareasOficio = partidas.filter(p => p["Oficio Asignado"] === selectedOficio && !p.Capítulo.endsWith('#'));
        setSendingEmails(true);
        try {
            for (const prov of provs) {
                await fetch(`${N8N_BASE_URL}/webhook/fase4-licitacion`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        propuesta_id: activeProject.Proyecto,
                        proveedor_id: prov.id,
                        proveedor_nombre: prov.Nombre,
                        proveedor_email: prov.Email,
                        oficio_solicitado: selectedOficio,
                        token: crypto.randomUUID(),
                        tareas: tareasOficio.map(t => ({ cap: t.Capítulo, descripcion: t.Descripción, unidad: t['Unidad IA'] || 'ud', precio_estimado: t.precio_base_estimado || 0 }))
                    })
                });
            }
            showToast(`✅ Solicitudes enviadas.`);
            setSelectedOficio("");
            setSelectedProviders({});
        } catch (err) { showToast("Error al enviar solicitudes.", "error"); }
        finally { setSendingEmails(false); }
    };

    const updateOficio = (idx, newOficio) => {
        const copy = [...partidas];
        copy[idx]["Oficio Asignado"] = newOficio;
        copy[idx].isModified = true;
        setPartidas(copy);
        setHasUnsavedChanges(true);
    };

    const handleDownloadPDF = () => {
        try {
            const precioTotal = (partidas || [])
                .filter(p => !p.Capítulo?.endsWith('#'))
                .reduce((acc, p) => acc + (parseFloat(p['Precio Total (€)'] || 0)), 0);

            const doc = generarPresupuestoPDF({
                cliente:      activeProject.cliente || activeProject.Proyecto,
                propuesta_id: activeProject.Proyecto,
                descripcion:  activeProject.descripcion || activeProject.Proyecto,
                partidas,
                precio_total: precioTotal,
                fecha:        new Date().toISOString(),
                titulo:       'Borrador de Presupuesto',
            });
            const fname = 'Borrador_' + (activeProject.Proyecto || 'presupuesto').replace(/[^a-zA-Z0-9_-]/g, '_');
            descargarPDF(doc, fname);
        } catch (err) {
            console.error('[PDF] ERROR:', err);
            showToast('Error al generar PDF: ' + err.message, 'error');
        }
    };

    const confirmSendToReview = async () => {
        if (!jefeInput.trim()) return showToast("Asigna un Jefe de Obra.", "warning");
        setLoadingProject(true);
        try {
            if (hasUnsavedChanges) await saveAssignments();
            await supabase.from('propuestas').update({ estado: 'En Revisión', jefe_obra: jefeInput.trim() }).eq('Proyecto', activeProject.Proyecto);
            showToast("Enviado a revisión.", "success");
            setActiveProject(null);
            fetchProyectos(true);
        } catch (err) { showToast("Error al enviar.", "error"); }
        finally { setLoadingProject(false); setShowReviewModal(false); }
    };

    const budgetTotal = (partidas || []).reduce((acc, p) => p.Capítulo?.endsWith('#') ? acc : acc + (parseFloat(p['Precio Total (€)'] || 0) * parseFloat(p.Cantidad || 1)), 0);
    const listaOficios = ["Sin asignar", ...[...new Set([...TODOS_LOS_OFICIOS, ...proveedores.map(p => p.Oficio)])].sort()];
    const oficiosAsignados = [...new Set((partidas || []).map(p => p["Oficio Asignado"]).filter(o => o !== "Sin asignar"))];

    if (activeProject) {
        return (
            <>
                {ModalUI} {ToastUI}
                <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
                    <div className="glass-card" style={{ marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
                            <button className="btn btn-secondary" onClick={() => setActiveProject(null)} style={{ padding: '8px', borderRadius: '50%' }}><ArrowLeft size={18} /></button>
                            <div>
                                <h1 style={{ margin: 0, fontSize: '1.4rem' }}>
                                    {activeProject.cliente || activeProject.Proyecto.split('_')[0]}
                                    <button className="btn btn-secondary btn-sm" onClick={openEditMetadata} style={{ marginLeft: '10px' }}>✏️ Editar Datos</button>
                                </h1>
                                {activeProject.direccion && <span style={{ fontSize: '0.8rem' }}>📧 {activeProject.direccion}</span>}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            <button className="btn btn-secondary" onClick={handleDownloadPDF}><FileDown size={16} /> PDF</button>
                            <button className="btn btn-success" onClick={saveAssignments} disabled={saving}><Save size={16} /> Guardar</button>
                            <button className="btn btn-primary" onClick={() => setShowReviewModal(true)}><ClipboardCheck size={16} /> Revisión</button>
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                        <div className="glass-card">
                            <h3>🤖 IA</h3>
                            <button className="btn btn-primary" onClick={handleAI} disabled={aiLoading} style={{ width: '100%' }}>Auto-asignar</button>
                        </div>
                        <div className="glass-card">
                            <h3>🔍 Histórico</h3>
                            <button className="btn btn-secondary" onClick={handleHistoricalAssign} disabled={histLoading} style={{ width: '100%' }}>Buscar Precios</button>
                        </div>
                        <div className="glass-card">
                            <h3>✉️ Licitación</h3>
                            <select value={selectedOficio} onChange={(e) => setSelectedOficio(e.target.value)} style={{ width: '100%', marginBottom: '10px' }}>
                                <option value="">Gremio</option>
                                {oficiosAsignados.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                            <button className="btn btn-primary" onClick={handleRequestQuotes} disabled={!selectedOficio || sendingEmails} style={{ width: '100%' }}>Enviar</button>
                        </div>
                    </div>

                    <div className="glass-card" style={{ textAlign: 'right', marginBottom: '20px' }}>
                        <div style={{ fontSize: '0.8rem' }}>TOTAL ESTIMADO</div>
                        <div style={{ fontSize: '1.8rem', fontWeight: 800, color: 'var(--success)' }}>{budgetTotal.toLocaleString('es-ES')} €</div>
                    </div>

                    <div className="glass-card">
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr><th>Cap.</th><th>Descripción</th><th>Cant.</th><th>Ud.</th><th>Costo (€)</th><th>Oficio</th></tr>
                                </thead>
                                <tbody>
                                    {partidas.map((p, idx) => (
                                        <tr key={idx} style={{ backgroundColor: p.Capítulo?.endsWith('#') ? 'var(--bg-secondary)' : 'transparent' }}>
                                            <td>{p.Capítulo?.replace(/#+/g, '')}</td>
                                            <td>{p.Descripción}</td>
                                            <td>{!p.Capítulo?.endsWith('#') && <input type="number" value={p.Cantidad} onChange={(e) => updateCantidad(idx, e.target.value)} style={{ width: '60px' }} />}</td>
                                            <td>{!p.Capítulo?.endsWith('#') && <input type="text" value={p['Unidad IA']} onChange={(e) => updateUnidad(idx, e.target.value)} style={{ width: '50px' }} />}</td>
                                            <td>{!p.Capítulo?.endsWith('#') && <input type="number" value={p['Precio Total (€)']} onChange={(e) => updatePrice(idx, e.target.value)} style={{ width: '90px' }} />}</td>
                                            <td>{!p.Capítulo?.endsWith('#') && <select value={p["Oficio Asignado"]} onChange={(e) => updateOficio(idx, e.target.value)}>{listaOficios.map(of => <option key={of} value={of}>{of}</option>)}</select>}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {showReviewModal && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <div className="glass-card" style={{ maxWidth: '400px', width: '90%' }}>
                            <h3>Asignar Jefe de Obra</h3>
                            <input type="text" value={jefeInput} onChange={(e) => setJefeInput(e.target.value)} style={{ width: '100%', marginBottom: '20px', padding: '10px' }} />
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                <button className="btn btn-secondary" onClick={() => setShowReviewModal(false)}>Cancelar</button>
                                <button className="btn btn-primary" onClick={confirmSendToReview}>Confirmar</button>
                            </div>
                        </div>
                    </div>
                )}

                {showEditMetadata && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <div className="glass-card" style={{ maxWidth: '450px', width: '90%', padding: '25px' }}>
                            <h3>Editar Datos</h3>
                            <div style={{ marginBottom: '15px' }}>
                                <label>Cliente:</label>
                                <input type="text" value={metadataForm.cliente} onChange={(e) => setMetadataForm({...metadataForm, cliente: e.target.value})} style={{ width: '100%' }} />
                            </div>
                            <div style={{ marginBottom: '15px' }}>
                                <label>Email:</label>
                                <input type="email" value={metadataForm.cliente_email} onChange={(e) => setMetadataForm({...metadataForm, cliente_email: e.target.value})} style={{ width: '100%' }} />
                            </div>
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                                <button className="btn btn-secondary" onClick={() => setShowEditMetadata(false)}>Cancelar</button>
                                <button className="btn btn-primary" onClick={saveMetadata}>Guardar</button>
                            </div>
                        </div>
                    </div>
                )}
            </>
        );
    }

    return (
        <div className="animate-fade-in">
            {ModalUI} {ToastUI}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1>Borradores</h1>
                <button className="btn btn-secondary" onClick={() => fetchProyectos(true)}><RefreshCw size={16} /></button>
            </div>
            <div className="glass-card" style={{ marginTop: '24px' }}>
                {projectToDelete && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <div className="glass-card" style={{ maxWidth: '400px', width: '90%', textAlign: 'center' }}>
                            <h3 style={{ color: 'var(--danger)' }}>Confirmar borrado</h3>
                            <p>¿Borrar {projectToDelete.Proyecto}?</p>
                            <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
                                <button className="btn btn-secondary" onClick={() => setProjectToDelete(null)}>Cancelar</button>
                                <button className="btn btn-primary" style={{ backgroundColor: 'var(--danger)' }} onClick={() => { confirmDelete(projectToDelete); setProjectToDelete(null); }}>Borrar</button>
                            </div>
                        </div>
                    </div>
                )}
                <div className="table-container">
                    <table>
                        <thead><tr><th>Proyecto</th><th style={{ textAlign: 'right' }}>Acciones</th></tr></thead>
                        <tbody>
                            {proyectos.map((pro, idx) => (
                                <tr key={idx}>
                                    <td>{pro.cliente || pro.Proyecto.split('_')[0]}</td>
                                    <td style={{ textAlign: 'right' }}>
                                        <button className="btn btn-secondary btn-sm" onClick={() => openProject(pro)}>Abrir</button>
                                        <button className="btn btn-secondary btn-sm" onClick={() => setProjectToDelete(pro)} style={{ color: 'var(--error)' }}><Trash2 size={14} /></button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default Borradores;
