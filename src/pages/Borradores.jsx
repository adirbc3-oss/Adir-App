import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { N8N_BASE_URL } from '../config';
import { supabase } from '../utils/supabaseClient';
import { useModal, useToast } from '../utils/useModal';
import { Loader2, Bot, ArrowLeft, ArrowRight, Hash, Save, Trash2, Send, RefreshCw, Mail, Search, FileDown, ClipboardCheck, Folder, Calendar, User, Users, CheckSquare, Square, Check, X } from 'lucide-react';
import { asignarProveedoresIA, TODOS_LOS_OFICIOS } from '../utils/aiAllocation';
import { generarPresupuestoPDF, descargarPDF } from '../utils/pdfUtils';

const Borradores = ({ sessionCache = {}, setSessionCache }) => {
    const { showConfirm, ModalUI } = useModal();
    const { showToast, ToastUI } = useToast();
    const navigate = useNavigate();

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

    const [showLicitationModal, setShowLicitationModal] = useState(false);

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
            // 1. Buscar en base ADIR por código exacto
            const codigosActuales = partidas
                .map(p => p.texto_partida ? p.texto_partida.split('::')[0].trim() : "")
                .filter(c => c && !c.includes('#'));

            const adirBaseMap = new Map();
            if (codigosActuales.length > 0) {
                const { data: baseData, error: baseError } = await supabase
                    .from('base_precios_adir')
                    .select('codigo, precio_total, unidad')
                    .in('codigo', codigosActuales);
                if (!baseError && baseData) {
                    baseData.forEach(item => adirBaseMap.set(item.codigo, { precio: item.precio_total, unidad: item.unidad }));
                }
            }

            // 2. Buscar en histórico (sin límite de fecha, todos los proyectos anteriores)
            const { data: propData, error: propError } = await supabase
                .from('propuestas')
                .select('Proyecto')
                .neq('Proyecto', activeProject.Proyecto)
                .neq('estado', 'Pendiente');

            const historyMap = new Map();   // clave: texto_partida exacto
            const codeHistMap = new Map();  // clave: código (antes de ::)

            if (!propError && propData && propData.length > 0) {
                const { data: partData, error: partError } = await supabase
                    .from('partidas')
                    .select('texto_partida, precio_adjudicado, precio_base_estimado, unidad')
                    .in('propuesta_id', propData.map(p => p.Proyecto));

                if (!partError && partData) {
                    partData.forEach(p => {
                        const precio = parseFloat(p.precio_adjudicado) > 0
                            ? parseFloat(p.precio_adjudicado)
                            : (parseFloat(p.precio_base_estimado) > 0 ? parseFloat(p.precio_base_estimado) : 0);
                        if (precio > 0 && p.texto_partida) {
                            // Match exacto por texto_partida completo
                            if (!historyMap.has(p.texto_partida)) {
                                historyMap.set(p.texto_partida, { precio, unidad: p.unidad });
                            }
                            // Match por código (más flexible)
                            const code = p.texto_partida.split('::')[0]?.trim();
                            if (code && !codeHistMap.has(code)) {
                                codeHistMap.set(code, { precio, unidad: p.unidad });
                            }
                        }
                    });
                }
            }

            let aplicadasAdir = 0, aplicadasHist = 0;
            const newPartidas = partidas.map(p => {
                if (p.Capítulo && p.Capítulo.match(/#+$/)) return p;
                const codigo = p.texto_partida ? p.texto_partida.split('::')[0].trim() : "";

                // Prioridad 1: Base ADIR
                const adirMatch = adirBaseMap.get(codigo);
                if (adirMatch && adirMatch.precio > 0) {
                    aplicadasAdir++;
                    return {
                        ...p,
                        "Precio Total (€)": adirMatch.precio,
                        "Unidad IA": adirMatch.unidad || p["Unidad IA"] || "ud",
                        isModified: true,
                        origen_modificacion: 'Base ADIR'
                    };
                }

                // Prioridad 2: Histórico exacto
                const histExact = historyMap.get(p.texto_partida);
                if (histExact && histExact.precio > 0) {
                    aplicadasHist++;
                    return {
                        ...p,
                        "Precio Total (€)": histExact.precio,
                        "Unidad IA": histExact.unidad || p["Unidad IA"] || "ud",
                        isModified: true,
                        origen_modificacion: 'Histórico'
                    };
                }

                // Prioridad 3: Histórico por código
                const histCode = codeHistMap.get(codigo);
                if (histCode && histCode.precio > 0) {
                    aplicadasHist++;
                    return {
                        ...p,
                        "Precio Total (€)": histCode.precio,
                        "Unidad IA": histCode.unidad || p["Unidad IA"] || "ud",
                        isModified: true,
                        origen_modificacion: 'Histórico (código)'
                    };
                }

                return p;
            });

            if (aplicadasAdir > 0 || aplicadasHist > 0) {
                setPartidas(newPartidas);
                setHasUnsavedChanges(true);
                showToast(`✅ Aplicados ${aplicadasAdir} de Base ADIR y ${aplicadasHist} de históricos.`);
            } else {
                showToast('No se encontraron coincidencias en histórico ni base ADIR.', 'warning');
            }
        } catch (error) {
            console.error("Error en búsqueda histórica:", error);
            showToast('Error al buscar precios: ' + error.message, 'error');
        } finally {
            setHistLoading(false);
        }
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
                    return {
                        ...p,
                        "Oficio Asignado": info.oficio,
                        "Precio IA": info.precio || 0,
                        "Justificacion IA": info.justificacion || "",
                        "Unidad IA": info.unidad || p["Unidad IA"] || "ud",
                        isModified: true,
                        origen_modificacion: 'IA'
                        // "Precio Total (€)" NO se toca — es el precio real que edita el usuario
                    };
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

    const toggleProvider = (provName) => {
        setSelectedProviders(prev => ({
            ...prev,
            [provName]: !prev[provName]
        }));
    };

    const selectAllProvidersOficio = () => {
        const provsOficio = proveedores.filter(p => p.Oficio === selectedOficio);
        const newState = { ...selectedProviders };
        provsOficio.forEach(p => {
            newState[p.Nombre] = true;
        });
        setSelectedProviders(newState);
    };

    const deselectAllProvidersOficio = () => {
        const provsOficio = proveedores.filter(p => p.Oficio === selectedOficio);
        const newState = { ...selectedProviders };
        provsOficio.forEach(p => {
            newState[p.Nombre] = false;
        });
        setSelectedProviders(newState);
    };

    const handleRequestQuotes = async () => {
        // Guardar cambios antes de enviar para que el precio esté actualizado en BD
        if (hasUnsavedChanges) {
            const saved = await saveAssignments();
            if (!saved) {
                showToast("No se pudo guardar antes de enviar. Inténtalo de nuevo.", "error");
                return;
            }
        }

        const provs = proveedores.filter(p => p.Oficio === selectedOficio && selectedProviders[p.Nombre]);
        if (provs.length === 0) return showToast("Selecciona proveedores.", "warning");

        const tareasOficio = partidas.filter(p =>
            p["Oficio Asignado"] === selectedOficio && !p.Capítulo?.endsWith('#')
        );

        if (tareasOficio.length === 0) {
            return showToast(`No hay partidas asignadas al gremio "${selectedOficio}".`, "warning");
        }

        setSendingEmails(true);
        let enviados = 0;
        let errores = 0;

        try {
            for (const prov of provs) {
                const payload = {
                    propuesta_id: activeProject.Proyecto,
                    cliente_nombre: activeProject.cliente || activeProject.Proyecto,
                    proveedor_id: String(prov.id),
                    proveedor_nombre: prov.Nombre,
                    proveedor_email: prov.Email,
                    oficio_solicitado: selectedOficio,
                    token: crypto.randomUUID(),
                    tareas: tareasOficio.map(t => ({
                        cap: t.Capítulo,
                        descripcion: t.Descripción || t.texto_partida || '',
                        unidad: t['Unidad IA'] || 'ud',
                        cantidad: parseFloat(t.Cantidad) || 1,
                        precio_estimado: parseFloat(t['Precio Total (€)']) || parseFloat(t.precio_base_estimado) || 0
                    }))
                };

                try {
                    const res = await fetch(
                        `${N8N_BASE_URL}/webhook/fase4-licitacion`,
                        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
                    );
                    if (res.ok) {
                        enviados++;
                    } else {
                        console.warn(`[Licitación] Error HTTP ${res.status} para ${prov.Nombre}`);
                        errores++;
                    }
                } catch (fetchErr) {
                    console.error(`[Licitación] Error de red para ${prov.Nombre}:`, fetchErr);
                    errores++;
                }
            }

            if (enviados > 0) {
                showToast(`✅ Solicitudes enviadas a ${enviados} proveedor(es).${errores > 0 ? ` (${errores} con error de red)` : ''}`);
            } else {
                showToast(`No se pudo conectar con n8n. Verifica que VITE_N8N_BASE_URL esté configurado en Vercel.`, "error");
            }
            setSelectedOficio("");
            setSelectedProviders({});
        } catch (err) {
            showToast("Error inesperado: " + err.message, "error");
        } finally {
            setSendingEmails(false);
        }
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

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '20px', marginBottom: '20px', alignItems: 'start' }}>
                        <div className="glass-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                <Bot size={22} color="var(--primary)" />
                                <h3 style={{ margin: 0 }}>Inteligencia Artificial</h3>
                            </div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px', flex: 1 }}>
                                Analiza las descripciones de las partidas para asignar automáticamente el oficio más adecuado y estimar precios basados en modelos de lenguaje.
                            </p>
                            <button className="btn btn-primary" onClick={handleAI} disabled={aiLoading} style={{ width: '100%' }}>
                                {aiLoading ? <Loader2 className="loader-spinner" size={18} /> : <Bot size={18} />} 
                                {aiLoading ? 'Procesando...' : 'Auto-asignar con IA'}
                            </button>
                        </div>

                        <div className="glass-card" style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                <Search size={22} color="var(--primary)" />
                                <h3 style={{ margin: 0 }}>Buscador Histórico</h3>
                            </div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px', flex: 1 }}>
                                Cruza los datos de este proyecto con tu base de precios propia y proyectos anteriores para aplicar precios reales ya utilizados.
                            </p>
                            <button className="btn btn-secondary" onClick={handleHistoricalAssign} disabled={histLoading} style={{ width: '100%' }}>
                                {histLoading ? <Loader2 className="loader-spinner" size={18} /> : <RefreshCw size={18} />} 
                                {histLoading ? 'Buscando...' : 'Aplicar Precios Históricos'}
                            </button>
                        </div>

                        <div className="glass-card" style={{ display: 'flex', flexDirection: 'column' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
                                <Mail size={22} color="var(--primary)" />
                                <h3 style={{ margin: 0 }}>Licitación de Gremios</h3>
                            </div>
                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '20px', flex: 1 }}>
                                Envía solicitudes de presupuesto a tus proveedores de confianza filtrando por gremio y seleccionando destinatarios específicos.
                            </p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                <select 
                                    value={selectedOficio} 
                                    onChange={(e) => {
                                        setSelectedOficio(e.target.value);
                                        setSelectedProviders({}); 
                                    }} 
                                    style={{ width: '100%' }}
                                >
                                    <option value="">Seleccionar Gremio</option>
                                    {oficiosAsignados.map(o => <option key={o} value={o}>{o}</option>)}
                                </select>

                                <button 
                                    className="btn btn-secondary" 
                                    onClick={() => setShowLicitationModal(true)} 
                                    disabled={!selectedOficio} 
                                    style={{ width: '100%', gap: '8px' }}
                                >
                                    <Users size={16} /> Seleccionar Proveedores
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card" style={{ 
                        padding: '16px 24px', 
                        marginBottom: '20px', 
                        display: 'flex', 
                        justifyContent: 'flex-end', 
                        alignItems: 'center',
                        gap: '20px',
                        background: 'linear-gradient(90deg, transparent, rgba(0,45,84,0.03))'
                    }}>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Total Estimado Proyecto</div>
                            <div style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'flex-end' }}>
                                {budgetTotal.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style={{ fontSize: '1.2rem', opacity: 0.7 }}>€</span>
                            </div>
                        </div>
                    </div>

                    <div className="glass-card">
                        <div className="table-container">
                            <table>
                                <thead>
                                    <tr>
                                        <th style={{ width: '80px' }}>Cap.</th>
                                        <th>Descripción de la Partida</th>
                                        <th style={{ width: '90px', textAlign: 'center' }}>Cant.</th>
                                        <th style={{ width: '70px', textAlign: 'center' }}>Ud.</th>
                                        <th style={{ width: '130px', textAlign: 'right' }}>Precio Real (€)</th>
                                        <th style={{ width: '130px', textAlign: 'right' }}>Est. IA (€)</th>
                                        <th style={{ width: '190px' }}>Oficio Asignado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {partidas.map((p, idx) => {
                                        const esCapitulo = p.Capítulo?.endsWith('#');
                                        const precioIA = parseFloat(p["Precio IA"]) || 0;
                                        const justif = p["Justificacion IA"] || "";
                                        return (
                                            <tr key={idx} style={{ backgroundColor: esCapitulo ? 'var(--bg-secondary)' : 'transparent' }}>
                                                <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{p.Capítulo?.replace(/#+/g, '')}</td>
                                                <td style={{ fontSize: '0.9rem', lineHeight: '1.4' }}>{p.Descripción}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    {!esCapitulo && <input type="number" value={p.Cantidad} onChange={(e) => updateCantidad(idx, e.target.value)} style={{ width: '70px', textAlign: 'center' }} />}
                                                </td>
                                                <td style={{ textAlign: 'center' }}>
                                                    {!esCapitulo && <input type="text" value={p['Unidad IA']} onChange={(e) => updateUnidad(idx, e.target.value)} style={{ width: '55px', textAlign: 'center' }} />}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    {!esCapitulo && <input type="number" value={p['Precio Total (€)']} onChange={(e) => updatePrice(idx, e.target.value)} style={{ width: '110px', textAlign: 'right', fontWeight: 700, color: 'var(--primary)' }} />}
                                                </td>
                                                <td style={{ textAlign: 'right' }}>
                                                    {!esCapitulo && precioIA > 0 && (
                                                        <div title={justif || "Sin justificación"} style={{ cursor: justif ? 'help' : 'default' }}>
                                                            <span style={{ fontSize: '0.88rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
                                                                {precioIA.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                            {justif && (
                                                                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', opacity: 0.75, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '120px' }}>
                                                                    {justif}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
                                                </td>
                                                <td>
                                                    {!esCapitulo && <select value={p["Oficio Asignado"]} onChange={(e) => updateOficio(idx, e.target.value)} style={{ width: '100%' }}>{listaOficios.map(of => <option key={of} value={of}>{of}</option>)}</select>}
                                                </td>
                                            </tr>
                                        );
                                    })}
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

                {showLicitationModal && (
                    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                        <div className="glass-card animate-fade-in" style={{ maxWidth: '500px', width: '90%', padding: '24px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                                <div>
                                    <h3 style={{ margin: 0 }}>Seleccionar Proveedores</h3>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Gremio: <strong>{selectedOficio}</strong></span>
                                </div>
                                <button className="btn-close" onClick={() => setShowLicitationModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-light)' }}><X size={20} /></button>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>DISPONIBLES</span>
                                <div style={{ display: 'flex', gap: '12px' }}>
                                    <button onClick={selectAllProvidersOficio} style={{ fontSize: '0.75rem', color: 'var(--primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Todos</button>
                                    <button onClick={deselectAllProvidersOficio} style={{ fontSize: '0.75rem', color: 'var(--text-light)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Ninguno</button>
                                </div>
                            </div>

                            <div className="providers-list" style={{ maxHeight: '300px', marginBottom: '24px', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '4px' }}>
                                {proveedores.filter(p => p.Oficio === selectedOficio).length > 0 ? (
                                    proveedores.filter(p => p.Oficio === selectedOficio).map(p => (
                                        <div key={p.id} className="provider-item" onClick={() => toggleProvider(p.Nombre)} style={{ padding: '12px', borderBottom: '1px solid var(--bg-secondary)' }}>
                                            {selectedProviders[p.Nombre] ? <CheckSquare size={18} color="var(--primary)" /> : <Square size={18} color="var(--border-color)" />}
                                            <span style={{ fontSize: '0.95rem' }}>{p.Nombre}</span>
                                        </div>
                                    ))
                                ) : (
                                    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-light)' }}>
                                        No hay proveedores registrados para este gremio.
                                    </div>
                                )}
                            </div>

                            <div style={{ display: 'flex', gap: '12px' }}>
                                <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowLicitationModal(false)}>Cancelar</button>
                                <button 
                                    className="btn btn-primary" 
                                    style={{ flex: 2 }}
                                    onClick={async () => {
                                        await handleRequestQuotes();
                                        setShowLicitationModal(false);
                                    }} 
                                    disabled={sendingEmails || Object.values(selectedProviders).filter(Boolean).length === 0}
                                >
                                    {sendingEmails ? <Loader2 className="loader-spinner" /> : <Send size={16} />} 
                                    {sendingEmails ? 'Enviando...' : `Enviar a ${Object.values(selectedProviders).filter(Boolean).length} seleccionados`}
                                </button>
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
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                    <h1>Borradores</h1>
                    <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Gestiona tus licitaciones y presupuestos en curso.</p>
                </div>
                <button className="btn btn-secondary" onClick={() => fetchProyectos(true)} style={{ padding: '10px' }}><RefreshCw size={18} /></button>
            </div>

            {loading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '15px', padding: '100px 0' }}>
                    <Loader2 className="loader-spinner" style={{ width: '40px', height: '40px' }} />
                    <p style={{ color: 'var(--text-muted)' }}>Cargando tus proyectos...</p>
                </div>
            ) : proyectos.length > 0 ? (
                <div className="project-grid">
                    {proyectos.map((pro, idx) => (
                        <div key={idx} className="project-card animate-fade-in">
                            <div className="project-card-header">
                                <div className="project-card-info">
                                    <h3 className="project-card-title">{pro.cliente || pro.Proyecto.split('_')[0]}</h3>
                                    <div className="info-item">
                                        <Hash size={14} /> <span>{pro.Proyecto}</span>
                                    </div>
                                    <div className="info-item">
                                        <Calendar size={14} /> <span>Recibido: {pro.fecha_recepcion || "Fecha no disponible"}</span>
                                    </div>
                                    <div className="info-item">
                                        <User size={14} /> <span>{pro.direccion || "Sin dirección asignada"}</span>
                                    </div>
                                </div>
                                <div className="badge badge-blue">Borrador</div>
                            </div>
                            
                            <div className="project-card-actions">
                                <button className="btn btn-primary" onClick={() => openProject(pro)} style={{ flex: 1, gap: '6px' }}>
                                    Abrir Proyecto <ArrowRight size={14} />
                                </button>
                                <button className="btn btn-secondary" onClick={() => setProjectToDelete(pro)} style={{ color: 'var(--danger)', padding: '10px' }}>
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="glass-card" style={{ textAlign: 'center', padding: '60px 20px', marginTop: '24px' }}>
                    <Folder size={48} color="var(--border-color)" style={{ marginBottom: '16px' }} />
                    <h3>No hay borradores</h3>
                    <p>Todos tus proyectos han sido procesados o aún no has subido ninguno.</p>
                    <button className="btn btn-primary mt-4" onClick={() => navigate('/nuevo')}>Empezar nuevo proyecto</button>
                </div>
            )}

            {projectToDelete && (
                <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', zIndex: 9999, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <div className="glass-card animate-fade-in" style={{ maxWidth: '400px', width: '90%', textAlign: 'center', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
                        <div style={{ background: 'rgba(220, 38, 38, 0.1)', width: '60px', height: '60px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                            <Trash2 size={30} color="var(--danger)" />
                        </div>
                        <h2 style={{ fontSize: '1.5rem', marginBottom: '10px' }}>¿Eliminar Borrador?</h2>
                        <p style={{ marginBottom: '25px' }}>Esta acción no se puede deshacer. Se borrará permanentemente <strong>{projectToDelete.cliente || projectToDelete.Proyecto}</strong> y todas sus partidas.</p>
                        <div style={{ display: 'flex', gap: '12px' }}>
                            <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setProjectToDelete(null)}>Cancelar</button>
                            <button className="btn btn-primary" style={{ flex: 1, backgroundColor: 'var(--danger)' }} onClick={() => { confirmDelete(projectToDelete); setProjectToDelete(null); }}>Eliminar Ahora</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Borradores;
