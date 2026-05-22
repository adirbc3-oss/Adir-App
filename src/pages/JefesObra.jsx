import React, { useState, useEffect } from 'react';
import { supabase } from '../utils/supabaseClient';
import { N8N_BASE_URL } from '../config';
import { useModal, useToast } from '../utils/useModal';
import {
  Loader2, RefreshCw, HardHat, FileText, ArrowLeft, CheckCircle,
  X, AlertCircle, Trophy, User, Calendar, Briefcase
} from 'lucide-react';
import { TODOS_LOS_OFICIOS, getCleanProjectName } from '../utils/aiAllocation';

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
    const [showFormatModal, setShowFormatModal] = useState(false);
    const [modoVista, setModoVista] = useState('desglose');
    
    const [showEditMetadata, setShowEditMetadata] = useState(false);
    const [metadataForm, setMetadataForm] = useState({ cliente: '', cliente_email: '', descripcion: '' });
    const [rawInputs, setRawInputs] = useState({});
    const [oficiosDinamicos, setOficiosDinamicos] = useState(TODOS_LOS_OFICIOS);

    const formatDecimal = (val) =>
        (parseFloat(val) || 0).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const parseDecimal = (str) =>
        parseFloat((str || '0').replace(/\./g, '').replace(',', '.')) || 0;

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
            // Cargar Oficios de Proveedores
            const { data: provData } = await supabase.from('proveedores').select('oficio_principal');
            if (provData) {
                const customOficios = provData.map(pr => pr.oficio_principal).filter(Boolean);
                const uniqueOficios = [...new Set([...TODOS_LOS_OFICIOS, ...customOficios])].sort();
                setOficiosDinamicos(uniqueOficios);
            }

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
                const descClean = p.texto_partida ? (p.texto_partida.includes('::') ? p.texto_partida.split('::').slice(1).join('::') : p.texto_partida).replace(/\|/g, ' ').replace(/\s{2,}/g, ' ').trim() : "";
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
                    solicitud_seleccionada_id: null
                };
            });

            // ── Normalización: eliminar título raíz y agrupar sueltas en EXTRAS ──
            // (misma lógica que Borradores)
            const esTituloRaiz = (cap) => {
                const base = (cap || '').replace(/#$/, '');
                if (!cap.endsWith('#')) return false;
                if (/^\d+(\.\d+)*$/.test(base)) return false;
                if (/^[A-Z0-9]+$/.test(base) && base.length <= 4) return false;
                return base.includes('__') || (/[A-Za-z]/.test(base) && base.length > 6);
            };

            const filteredPartidas = mapped.filter(p => !esTituloRaiz(p.Capítulo));

            const capitulosValidos = new Set(
                filteredPartidas
                    .filter(p => (p.Capítulo || '').endsWith('#'))
                    .map(p => p.Capítulo.replace(/#$/, ''))
            );

            const esPartidaSuelta = (p) => {
                const cap = (p.Capítulo || '').trim();
                if (cap.endsWith('#')) return false;
                const segmentos = cap.split('.');
                if (capitulosValidos.has(segmentos[0])) return false;
                return true;
            };

            const partidasSueltas = filteredPartidas.filter(esPartidaSuelta);
            const partidasNormales = filteredPartidas.filter(p => !esPartidaSuelta(p));

            const sortFn = (a, b) => {
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
            };

            const normalesSorted = [...partidasNormales].sort(sortFn);

            const extrasHeader = {
                id: '__extras_header__',
                Capítulo: '99_EXTRAS#',
                Descripción: 'PARTIDAS ADICIONALES / EXTRAS',
                'Oficio Asignado': 'Sin asignar',
                'Precio Total (€)': 0,
                Cantidad: 0,
                'Unidad IA': '',
                _synthetic: true,
                aprobado: false,
                isModified: false,
                solicitud_seleccionada_id: null
            };

            const sorted = partidasSueltas.length > 0
                ? [...normalesSorted, extrasHeader, ...partidasSueltas]
                : normalesSorted;

            setPartidas(sorted);
        } catch (err) {
            console.error(err);
            showAlert('Error cargando detalles del proyecto.', { type: 'error', title: 'Error' });
            setActiveProject(null);
        } finally {
            setLoadingProject(false);
        }
    };
    // Clasificar fila: 'capitulo' | 'subcapitulo' | 'partida' (igual que Borradores)
    const getTipoFila = (p) => {
        const cap = (p.Capítulo || '').trim();
        if (!cap.endsWith('#')) return 'partida';
        const codLimpio = cap.replace(/#$/, '');
        if (codLimpio === '99_EXTRAS') return 'capitulo';
        if (codLimpio.includes('.')) return 'subcapitulo';
        return 'capitulo';
    };

    const openEditMetadata = () => {
        setMetadataForm({
            cliente: activeProject.cliente || '',
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
            setShowFormatModal(true);
        }
    };

    // Calcula el total de un capítulo/subcapítulo sumando todas sus partidas descendientes
    const calcularTotalesCapitulos = (todasPartidas) => {
        const totales = {};
        const headers = todasPartidas.filter(p => getTipoFila(p) !== 'partida');
        const items   = todasPartidas.filter(p => getTipoFila(p) === 'partida');

        for (const header of headers) {
            const hCode    = (header.Capítulo || '').replace(/#+$/, '');
            const isExtras = hCode === '99_EXTRAS';
            const hIdx     = todasPartidas.indexOf(header);

            totales[header.Capítulo] = items.reduce((acc, item) => {
                const iIdx  = todasPartidas.indexOf(item);
                const iCode = (item.Capítulo || '').trim();
                const match = isExtras
                    ? iIdx > hIdx
                    : iCode === hCode || iCode.startsWith(hCode + '.');
                if (!match) return acc;
                return acc + (parseFloat(item['Precio Total (€)']) || 0) * (parseFloat(item.Cantidad) || 1);
            }, 0);
        }
        return totales;
    };

    // formato: 'capitulos' | 'desglose' — se pasa explícitamente para evitar closures estancados
    const confirmarProyecto = async (formato) => {
        setLoadingProject(true);
        setShowApproveWarning(false);
        setShowFormatModal(false);
        try {
            const updatePromises = partidas.filter(p => p.id && !p._synthetic).map(p => {
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
                .reduce((acc, p) => acc + (parseFloat(p['Precio Total (€)']) || 0) * (parseFloat(p.Cantidad) || 1), 0);

            // Calcular totales por capítulo de forma explícita (no depende de índices)
            const totalesCapitulos = calcularTotalesCapitulos(partidas);

            // Enriquecer todos los headers con su total calculado
            const partidasParaCliente = partidas.map(p => {
                const tipoFila = getTipoFila(p);
                if (tipoFila === 'capitulo' || tipoFila === 'subcapitulo') {
                    return { ...p, precio_total_capitulo: totalesCapitulos[p.Capítulo] ?? 0 };
                }
                return p;
            });

            // En modo 'capitulos': solo se guardan/envían los headers con sus totales
            // En modo 'desglose': se guarda todo (headers + partidas individuales)
            const soloCapitulos = formato === 'capitulos';
            const partidasGuardar = soloCapitulos
                ? partidasParaCliente.filter(p => {
                    const tipoFila = getTipoFila(p);
                    return tipoFila === 'capitulo' || tipoFila === 'subcapitulo';
                  })
                : partidasParaCliente;

            await supabase.from('presupuestos_cliente').insert({
                token,
                propuesta_id: activeProject.Proyecto,
                cliente_nombre: activeProject.cliente || '',
                cliente_email: activeProject.direccion || '',
                proyecto_descripcion: activeProject.descripcion || getCleanProjectName(activeProject.Proyecto),
                partidas: partidasGuardar,
                precio_total: precioTotal
            });

            const portalUrl = `${window.location.origin}/#/presupuesto-cliente?token=${token}`;

            // ─── Construir HTML del email según formato elegido ───
            let filasHtml = '';

            if (soloCapitulos) {
                // Solo capítulos y subcapítulos con su precio total acumulado
                filasHtml = partidasGuardar.map((p) => {
                    const tipoFila = getTipoFila(p);
                    const capClean = (p.Capítulo || '').replace(/#+$/, '');
                    const totalCap = parseFloat(p.precio_total_capitulo) || 0;
                    const esCap    = tipoFila === 'capitulo';
                    const bgColor  = esCap ? '#dce7f2' : '#eef4fb';
                    const paddingLeft = esCap ? '14px' : '28px';
                    const textColor   = esCap ? '#002D54' : '#2a5a8a';
                    const fontWeight  = esCap ? '700' : '600';
                    const borderStyle = esCap ? 'border-bottom: 2px solid #cbd5e1;' : 'border-bottom: 1px solid #e2e8f0;';
                    const desc = (p.Descripción || p.texto_partida || '-').replace(/</g, '&lt;').replace(/>/g, '&gt;');

                    return `<tr style="background:${bgColor}; ${borderStyle}">` +
                        `<td colspan="3" style="padding:10px 14px; padding-left:${paddingLeft}; font-size:13px; font-weight:${fontWeight}; color:${textColor};">` +
                            `${capClean ? capClean + ' — ' : ''}${desc}` +
                        `</td>` +
                        `<td style="padding:10px 14px; font-size:13px; text-align:right; font-weight:${fontWeight}; color:${textColor}; white-space:nowrap;">` +
                            `${totalCap.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` +
                        `</td>` +
                    `</tr>`;
                }).join('');
            } else {
                // Desglose completo: headers de capítulo con total + cada partida con su precio
                let partidaIndex = 0;
                filasHtml = partidasParaCliente.map((p) => {
                    const tipoFila = getTipoFila(p);
                    const capClean = (p.Capítulo || '').replace(/#+$/, '');
                    const desc = (p.Descripción || p.texto_partida || '-').replace(/</g, '&lt;').replace(/>/g, '&gt;');

                    if (tipoFila === 'capitulo' || tipoFila === 'subcapitulo') {
                        const totalCap = parseFloat(p.precio_total_capitulo) || 0;
                        const esCap    = tipoFila === 'capitulo';
                        const bgColor  = esCap ? '#dce7f2' : '#eef4fb';
                        const paddingLeft = esCap ? '14px' : '28px';
                        const textColor   = esCap ? '#002D54' : '#2a5a8a';
                        const fontWeight  = esCap ? '700' : '600';
                        const borderStyle = esCap ? 'border-top: 1px solid #cbd5e1; border-bottom: 2px solid #cbd5e1;' : 'border-bottom: 1px solid #e2e8f0;';

                        return `<tr style="background:${bgColor}; ${borderStyle}">` +
                            `<td colspan="3" style="padding:10px 14px; padding-left:${paddingLeft}; font-size:13px; font-weight:${fontWeight}; color:${textColor};">` +
                                `${capClean ? capClean + ' — ' : ''}${desc}` +
                            `</td>` +
                            `<td style="padding:10px 14px; font-size:13px; text-align:right; font-weight:${fontWeight}; color:${textColor}; white-space:nowrap;">` +
                                `${totalCap.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` +
                            `</td>` +
                        `</tr>`;
                    } else {
                        const pUnit = parseFloat(p['Precio Total (€)']) || 0;
                        const cant  = parseFloat(p.Cantidad) || 1;
                        const total = pUnit * cant;
                        const ud    = p['Unidad IA'] || p.unidad || 'ud';
                        const bgColor = partidaIndex % 2 === 0 ? '#ffffff' : '#f8fafc';
                        partidaIndex++;

                        return `<tr style="background:${bgColor};">` +
                            `<td style="padding:10px 14px; padding-left:42px; font-size:13px; color:#334155; border-bottom:1px solid #e2e8f0;">${desc}</td>` +
                            `<td style="padding:10px 14px; font-size:12px; text-align:center; color:#64748b; border-bottom:1px solid #e2e8f0; white-space:nowrap;">${cant.toLocaleString('es-ES', { maximumFractionDigits: 2 })} ${ud}</td>` +
                            `<td style="padding:10px 14px; font-size:12px; text-align:right; color:#64748b; border-bottom:1px solid #e2e8f0; white-space:nowrap;">${pUnit.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>` +
                            `<td style="padding:10px 14px; font-size:13px; text-align:right; font-weight:600; color:#002D54; border-bottom:1px solid #e2e8f0; white-space:nowrap;">${total.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>` +
                        `</tr>`;
                    }
                }).join('');
            }

            const theadHtml = soloCapitulos
                ? `<thead><tr style="background:#002D54;color:white;">` +
                    `<th colspan="3" style="padding:11px 14px;text-align:left;font-size:13px;">Capítulo / Descripción</th>` +
                    `<th style="padding:11px 14px;text-align:right;font-size:13px;width:140px;">Total (€)</th>` +
                  `</tr></thead>`
                : `<thead><tr style="background:#002D54;color:white;">` +
                    `<th style="padding:11px 14px;text-align:left;font-size:13px;">Descripción</th>` +
                    `<th style="padding:11px 14px;text-align:center;font-size:12px;width:100px;">Cantidad</th>` +
                    `<th style="padding:11px 14px;text-align:right;font-size:12px;width:110px;">Precio/ud (€)</th>` +
                    `<th style="padding:11px 14px;text-align:right;font-size:13px;width:120px;">Total (€)</th>` +
                  `</tr></thead>`;

            const htmlPresupuesto =
                `<table style="width:100%;border-collapse:collapse;font-family:Arial,sans-serif;margin:16px 0;">` +
                    theadHtml +
                    `<tbody>${filasHtml}</tbody>` +
                    `<tfoot><tr style="background:#002D54;color:white;">` +
                        `<td colspan="3" style="padding:12px 14px;font-weight:bold;font-size:15px;text-align:left;">TOTAL PRESUPUESTO</td>` +
                        `<td style="padding:12px 14px;text-align:right;font-weight:bold;font-size:15px;white-space:nowrap;">${precioTotal.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</td>` +
                    `</tr></tfoot>` +
                `</table>`;

            // Sanitizar HTML: comillas dobles → simples, colapsar whitespace (seguro para JSON)
            const htmlPresupuestoSafe = htmlPresupuesto.replace(/"/g, "'").replace(/\s+/g, ' ').trim();

            // Fire-and-forget: no esperamos respuesta de n8n para no bloquear la UI
            fetch(`${N8N_BASE_URL}/webhook/presupuesto-cliente`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    token,
                    cliente_email: activeProject.direccion || '',
                    cliente_nombre: activeProject.cliente || '',
                    proyecto_nombre: getCleanProjectName(activeProject.Proyecto),
                    proyecto: activeProject.Proyecto,
                    precio_total: precioTotal,
                    portal_url: portalUrl,
                    html_presupuesto: htmlPresupuestoSafe,
                    modo_vista: formato,
                    partidas: soloCapitulos
                        ? partidasGuardar.map(p => ({
                            texto_partida: (p.Capítulo || 'S/C') + '::' + (p.Descripción || p.texto_partida || 'Sin descripcion'),
                            precio_adjudicado: parseFloat(p.precio_total_capitulo) || 0,
                            precio_base_estimado: parseFloat(p.precio_total_capitulo) || 0,
                            cantidad: 1,
                            unidad: 'ud'
                        }))
                        : partidas
                            .filter(p => !p.Capítulo?.endsWith('#'))
                            .map(p => ({
                                texto_partida: (p.Capítulo || 'S/C') + '::' + (p.Descripción || p.texto_partida || 'Sin descripcion'),
                                precio_adjudicado: parseFloat(p['Precio Total (€)']) || 0,
                                precio_base_estimado: parseFloat(p['Precio Total (€)']) || 0,
                                cantidad: parseFloat(p.Cantidad) || 1,
                                unidad: p['Unidad IA'] || p.unidad || 'ud'
                            }))
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
                                    <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '6px' }}><HardHat size={32} color="var(--primary)" /> 
                                        {getCleanProjectName(activeProject.Proyecto)}
                                        <button className="btn btn-secondary btn-sm" onClick={openEditMetadata} title="Editar Datos del Proyecto" style={{ padding: '4px 8px', fontSize: '0.75rem', fontWeight: 600 }}>
                                            ✏️ Editar Datos
                                        </button>
                                    </h1>
                                    <div style={{ display: 'flex', gap: '15px', marginTop: '4px', marginBottom: '10px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                        {activeProject.cliente && <span>👤 <strong>Cliente:</strong> {activeProject.cliente}</span>}
                                        {activeProject.direccion && <span>📧 <strong>Email:</strong> {activeProject.direccion}</span>}
                                    </div>
                                    <span className="badge badge-blue">Revisión de Jefe de Obra</span>
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
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
                                        .reduce((acc, p) => acc + (parseFloat(p['Precio Total (€)']) || 0) * (parseFloat(p.Cantidad) || 1), 0)
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
                                                <th style={{ width: '55px', textAlign: 'center' }}>Ud.</th>
                                                <th style={{ width: '120px' }}>Oficio</th>
                                                <th>Proveedor / Oferta</th>
                                                <th style={{ width: '100px', textAlign: 'right' }}>Precio/ud (€)</th>
                                                <th style={{ width: '100px', textAlign: 'right' }}>Total (€)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {partidas.map((p, idx) => {
                                                const tipoFila = getTipoFila(p);
                                                const esCapitulo   = tipoFila === 'capitulo';
                                                const esSubcap     = tipoFila === 'subcapitulo';
                                                const esPartida    = tipoFila === 'partida';
                                                const capClean = (p.Capítulo || '').replace(/#+/g, '');

                                                let rowStyle = { backgroundColor: 'transparent' };
                                                let codStyle = { fontWeight: 500, color: 'var(--text-muted)', paddingLeft: '8px', verticalAlign: 'middle' };
                                                let descStyle = { fontSize: '0.85rem', color: 'var(--text-main)', fontWeight: 400, paddingLeft: '8px', verticalAlign: 'middle' };

                                                if (esCapitulo) {
                                                    rowStyle = { backgroundColor: '#dce7f2', borderTop: '1px solid var(--border-color)', borderBottom: '1px solid var(--border-color)' };
                                                    codStyle = { ...codStyle, fontWeight: 800, color: 'var(--primary)', fontSize: '0.92rem', paddingLeft: '10px' };
                                                    descStyle = { ...descStyle, fontWeight: 700, color: 'var(--primary)', fontSize: '0.92rem' };
                                                } else if (esSubcap) {
                                                    rowStyle = { backgroundColor: 'var(--bg-secondary)' };
                                                    codStyle = { ...codStyle, fontWeight: 700, color: '#2a5a8a', fontSize: '0.88rem', paddingLeft: '10px' };
                                                    descStyle = { ...descStyle, fontWeight: 600, color: '#2a5a8a', fontSize: '0.88rem' };
                                                } else if (p.aprobado) {
                                                    rowStyle = { backgroundColor: 'rgba(22, 163, 74, 0.05)' };
                                                }

                                                return (
                                                    <tr key={idx} style={rowStyle}>
                                                        <td style={{ textAlign: 'center', verticalAlign: 'middle' }}>
                                                            {esPartida && (
                                                                <input type="checkbox" checked={p.aprobado} onChange={() => toggleAprobado(idx)} style={{ transform: 'scale(1.2)', cursor: 'pointer' }} />
                                                            )}
                                                        </td>
                                                        <td style={codStyle}>{capClean}</td>
                                                        <td style={descStyle}>{p.Descripción}</td>
                                                        <td style={{ textAlign: 'center', fontSize: '0.8rem', verticalAlign: 'middle' }}>
                                                            {esPartida && (
                                                                <input
                                                                    type="text"
                                                                    value={rawInputs[`cant_${idx}`] ?? formatDecimal(p.Cantidad)}
                                                                    onChange={(e) => setRawInputs(prev => ({ ...prev, [`cant_${idx}`]: e.target.value }))}
                                                                    onBlur={(e) => {
                                                                        const v = parseDecimal(e.target.value);
                                                                        updateCantidad(idx, v);
                                                                        setRawInputs(prev => { const n = { ...prev }; delete n[`cant_${idx}`]; return n; });
                                                                    }}
                                                                    style={{ width: '60px', textAlign: 'center', padding: '4px', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: 'var(--bg-card)' }}
                                                                />
                                                            )}
                                                        </td>
                                                        <td style={{ textAlign: 'center', fontSize: '0.8rem', verticalAlign: 'middle' }}>
                                                            {esPartida && (
                                                                <input
                                                                    type="text"
                                                                    value={p['Unidad IA'] || ''}
                                                                    onChange={(e) => updateUnidad(idx, e.target.value)}
                                                                    style={{ width: '50px', textAlign: 'center', padding: '4px', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: 'var(--bg-card)' }}
                                                                />
                                                            )}
                                                        </td>
                                                        <td style={{ fontSize: '0.8rem', verticalAlign: 'middle' }}>
                                                            {esPartida && (
                                                                <select
                                                                    style={{ width: '100%', padding: '4px', borderRadius: '4px', fontSize: '0.75rem', backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-color)' }}
                                                                    onChange={(e) => updateOficio(idx, e.target.value)}
                                                                    value={p["Oficio Asignado"] || ''}
                                                                >
                                                                    <option value="Sin asignar">Sin asignar</option>
                                                                    {p["Oficio Asignado"] && p["Oficio Asignado"] !== "Sin asignar" && !oficiosDinamicos.includes(p["Oficio Asignado"]) && (
                                                                        <option value={p["Oficio Asignado"]}>{p["Oficio Asignado"]}</option>
                                                                    )}
                                                                    {oficiosDinamicos.map(of => (
                                                                        <option key={of} value={of}>{of}</option>
                                                                    ))}
                                                                </select>
                                                            )}
                                                        </td>
                                                        <td style={{ fontSize: '0.8rem', verticalAlign: 'middle' }}>
                                                            {esPartida && (
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
                                                        <td style={{ textAlign: 'right', verticalAlign: 'middle' }}>
                                                            {esPartida && (
                                                                <input
                                                                    type="text"
                                                                    value={rawInputs[`price_${idx}`] ?? formatDecimal(p['Precio Total (€)'])}
                                                                    onChange={(e) => setRawInputs(prev => ({ ...prev, [`price_${idx}`]: e.target.value }))}
                                                                    onBlur={(e) => {
                                                                        const v = parseDecimal(e.target.value);
                                                                        updatePrice(idx, v);
                                                                        setRawInputs(prev => { const n = { ...prev }; delete n[`price_${idx}`]; return n; });
                                                                    }}
                                                                    style={{ width: '88px', textAlign: 'right', padding: '6px', border: '1px solid var(--border-color)', borderRadius: '4px', backgroundColor: 'var(--bg-card)' }}
                                                                />
                                                            )}
                                                        </td>
                                                        <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--primary)', whiteSpace: 'nowrap', fontSize: '0.85rem', verticalAlign: 'middle' }}>
                                                            {esPartida && (
                                                                ((parseFloat(p['Precio Total (€)']) || 0) * (parseFloat(p.Cantidad) || 1))
                                                                    .toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
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
                        <div className="glass-card" style={{ marginBottom: '20px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                                    <div>
                                        <h1 style={{ display: 'flex', alignItems: 'center', gap: '12px', margin: 0 }}><HardHat size={32} color="var(--primary)" /> Panel de Jefes de Obra</h1>
                                        <p style={{ margin: '2px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>Gestiona las revisiones técnicas y adjudicaciones.</p>
                                    </div>
                                </div>
                                <button className="btn btn-secondary" onClick={fetchProyectos} disabled={loading}>
                                    <RefreshCw size={16} className={loading ? 'loader-spinner' : ''} />
                                </button>
                            </div>
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
                                                            {getCleanProjectName(pro.Proyecto)}
                                                            <div style={{ fontSize: '0.8rem', color: 'var(--text-main)', fontWeight: 'normal', marginTop: '2px' }}>
                                                                👤 Cliente: {pro.cliente || "No asignado"}
                                                            </div>
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
                            <button onClick={() => { setShowApproveWarning(false); setShowFormatModal(true); }} style={btnSuccess}>Aprobar de todas formas</button>
                        </div>
                    </div>
                </div>
            )}

            {showFormatModal && (
                 <div style={modalOverlay}>
                     <div style={{...modalContent, textAlign: 'left', maxWidth: '500px'}}>
                         <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '15px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                             <span style={{ fontSize: '1.5rem' }}>📧</span>
                             <h3 style={{ margin: 0, color: 'var(--primary)', fontSize: '1.25rem', fontWeight: 700 }}>Formato del Presupuesto por Email</h3>
                         </div>
                         <p style={{ margin: '0 0 20px', fontSize: '0.9rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                             Selecciona cómo deseas que el cliente visualice el presupuesto en el correo electrónico de firma digital:
                         </p>
                         
                         <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '25px' }}>
                             <label 
                                 style={{
                                     display: 'flex',
                                     alignItems: 'flex-start',
                                     gap: '12px',
                                     padding: '16px',
                                     borderRadius: '12px',
                                     border: modoVista === 'desglose' ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                                     backgroundColor: modoVista === 'desglose' ? 'rgba(0, 45, 84, 0.04)' : 'transparent',
                                     cursor: 'pointer',
                                     transition: 'all 0.2s'
                                 }}
                             >
                                 <input 
                                     type="radio" 
                                     name="modoVistaEmail" 
                                     value="desglose" 
                                     checked={modoVista === 'desglose'} 
                                     onChange={() => setModoVista('desglose')}
                                     style={{ marginTop: '4px', accentColor: 'var(--primary)' }}
                                 />
                                 <div>
                                     <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--text-main)', marginBottom: '2px' }}>Desglose completo de partidas</strong>
                                     <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Muestra todas las partidas de la obra con sus descripciones, cantidades, precios unitarios y totales.</span>
                                 </div>
                             </label>

                             <label 
                                 style={{
                                     display: 'flex',
                                     alignItems: 'flex-start',
                                     gap: '12px',
                                     padding: '16px',
                                     borderRadius: '12px',
                                     border: modoVista === 'capitulos' ? '2px solid var(--primary)' : '1px solid var(--border-color)',
                                     backgroundColor: modoVista === 'capitulos' ? 'rgba(0, 45, 84, 0.04)' : 'transparent',
                                     cursor: 'pointer',
                                     transition: 'all 0.2s'
                                 }}
                             >
                                 <input 
                                     type="radio" 
                                     name="modoVistaEmail" 
                                     value="capitulos" 
                                     checked={modoVista === 'capitulos'} 
                                     onChange={() => setModoVista('capitulos')}
                                     style={{ marginTop: '4px', accentColor: 'var(--primary)' }}
                                 />
                                 <div>
                                     <strong style={{ display: 'block', fontSize: '0.95rem', color: 'var(--text-main)', marginBottom: '2px' }}>Solo totales por capítulo</strong>
                                     <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Muestra únicamente la suma total acumulada por cada capítulo o grupo de trabajo, simplificando la vista.</span>
                                 </div>
                             </label>
                         </div>

                         <div style={{ display: 'flex', gap: '12px' }}>
                             <button className="btn btn-secondary" onClick={() => setShowFormatModal(false)} style={{ flex: 1 }}>
                                 Cancelar
                             </button>
                             <button
                                 className="btn btn-success"
                                 onClick={() => confirmarProyecto(modoVista)}
                                 style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}
                             >
                                 <CheckCircle size={16} /> Aprobar y Enviar
                             </button>
                         </div>
                     </div>
                 </div>
             )}

            {showEditMetadata && (
                <div style={modalOverlay}>
                    <div style={{...modalContent, textAlign: 'left', maxWidth: '450px'}}>
                        <h3 style={{ color: 'var(--accent-primary)', marginBottom: '15px' }}>✏️ Editar Datos del Proyecto</h3>
                        
                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', fontWeight: 600 }}>Proyecto (de BC3):</label>
                            <input 
                                type="text" 
                                value={getCleanProjectName(activeProject.Proyecto)} 
                                disabled
                                readOnly
                                style={{ width: '100%', padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)', backgroundColor: '#f1f5f9', color: '#64748b', cursor: 'not-allowed' }}
                            />
                        </div>
                        
                        <div style={{ marginBottom: '15px' }}>
                            <label style={{ display: 'block', marginBottom: '5px', fontSize: '0.85rem', fontWeight: 600 }}>Nombre del Cliente:</label>
                            <input 
                                type="text" 
                                value={metadataForm.cliente} 
                                onChange={(e) => setMetadataForm({...metadataForm, cliente: e.target.value})}
                                placeholder="Nombre del cliente..."
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
