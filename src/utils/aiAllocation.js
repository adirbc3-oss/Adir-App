import { supabase } from './supabaseClient';

export const TODOS_LOS_OFICIOS = [
    "Albañilería", "Estructuras de Hormigón", "Estructuras Metálicas",
    "Movimiento de Tierras", "Cimentaciones", "Cubiertas y Tejados",
    "Impermeabilización", "Aislamientos", "Fontanería", "Electricidad",
    "Climatización (HVAC)", "Carpintería de Madera", "Carpintería Metálica/Aluminio",
    "Cristalería", "Pintura", "Yesos y Escayolas", "Solados y Alicatados",
    "Falsos Techos", "Ascensores y Elevación", "Cerrajería", "Jardinería y Exteriores",
    "Limpieza de Obra", "Gestión de Residuos", "Seguridad y Salud", "Demolición", 
    "Saneamiento", "Instalaciones especiales", "Obra civil", "Topografía"
];

const BATCH_SIZE = 6;

/**
 * Búsqueda en históricos adjudicados.
 */
const getHistoricalContext = async (descripcion) => {
    try {
        if (!descripcion || descripcion.length < 5) return "";
        const cleanDesc = descripcion.substring(0, 20); // Buscar por el inicio de la descripción
        const { data } = await supabase
            .from('partidas')
            .select('texto_partida, precio_adjudicado')
            .ilike('texto_partida', `%${cleanDesc}%`)
            .gt('precio_adjudicado', 0)
            .limit(2);

        if (!data || data.length === 0) return "";
        return data.map(r => 
            `- [HISTÓRICO REAL]: ${r.texto_partida} (Adjudicado por ${r.precio_adjudicado}€)`
        ).join('\n');
    } catch (e) { return ""; }
};

/**
 * Búsqueda avanzada en CYPE con categoría y unidad.
 */
const getCypeContext = async (descripcion) => {
    try {
        if (!descripcion || descripcion.length < 4) return "";
        const cleanDesc = descripcion.split('::').pop().split(' ').filter(w => w.length > 3).slice(0, 3).join('%');
        
        const { data } = await supabase
            .from('PreciosCype')
            .select('codigo, categoria, unidad, descripcion_corta, precio_total, mano_de_obra, materiales, maquinaria')
            .or(`descripcion_corta.ilike.%${cleanDesc}%,descripcion_detallada.ilike.%${cleanDesc}%`)
            .limit(3);

        if (!data || data.length === 0) return "Sin referencias exactas.";
        
        return data.map(r => 
            `- [CYPE ${r.codigo}] (${r.categoria}): ${r.descripcion_corta}. PVP:${r.precio_total}€/${r.unidad}. (MO:${r.mano_de_obra}€, Mat:${r.materiales}€, Maq:${r.maquinaria}€)`
        ).join('\n');
    } catch (e) { return "Error de consulta."; }
};

/**
 * Búsqueda en la Base de Precios OFICIAL de ADIR (Máxima Prioridad)
 */
const getAdirContext = async (descripcion) => {
    try {
        if (!descripcion || descripcion.length < 4) return "";
        const codigo = descripcion.split('::')[0].trim();
        const texto = descripcion.split('::').pop().trim();
        
        // Buscamos por código exacto o descripción corta
        const { data } = await supabase
            .from('base_precios_adir')
            .select('codigo, descripcion_corta, precio_total, unidad, mano_de_obra, materiales_y_otros')
            .or(`codigo.eq.${codigo},descripcion_corta.ilike.%${texto.substring(0, 20)}%`)
            .limit(2);

        if (!data || data.length === 0) return "";
        return data.map(r => 
            `- [ADIR OFICIAL]: ${r.descripcion_corta} (${r.codigo}). Precio: ${r.precio_total}€/${r.unidad}. (MO: ${r.mano_de_obra}€, Otros: ${r.materiales_y_otros}€)`
        ).join('\n');
    } catch (e) { return ""; }
};

export const asignarProveedoresIA = async (partidas, proveedores, onProgress) => {
    const apiKey = localStorage.getItem('mistral_api_key');
    if (!apiKey) throw new Error("API Key no configurada.");
    
    const itemsParaIA = partidas
        .filter(p => !((p.Capítulo || p.Capitulo || "").endsWith('#')))
        .map(p => ({
            id: p.id || Math.random().toString(36),
            cap: p.Capítulo || p.Capitulo || "S/C",
            desc: (p.Descripción || p.Descripcion || p.texto_partida || "").toString().trim(),
            unidad: p["Unidad IA"] || p.unidad || ""
        }));

    if (itemsParaIA.length === 0) return { asignaciones: {}, sinProveedor: [] };

    const oficiosDisponibles = TODOS_LOS_OFICIOS.join(', ');
    const asignacionesFinales = {};
    const oficiosConPro = new Set(proveedores.map(prov => prov.Oficio));

        for (let i = 0; i < itemsParaIA.length; i += BATCH_SIZE) {
        const batch = itemsParaIA.slice(i, i + BATCH_SIZE);
        
        const contextPromises = batch.map(async (item) => {
            const adirContext = await getAdirContext(item.desc);
            const histContext = await getHistoricalContext(item.desc);
            const cypeContext = await getCypeContext(item.desc);

            let combinedContext = "";
            if (adirContext) combinedContext += `\nBASE DE PRECIOS ADIR (PRIORIDAD ALTA):\n${adirContext}`;
            if (histContext) combinedContext += `\nDATOS HISTÓRICOS ADJUDICADOS:\n${histContext}`;
            combinedContext += `\nDATOS CYPE MURCIA:\n${cypeContext}`;

            const unidadActual = item.unidad ? `\nUNIDAD ACTUAL: ${item.unidad}` : '\nUNIDAD ACTUAL: (sin asignar — asignar la más apropiada)';

            return `TAREA ID: ${item.id}\nDESCRIPCIÓN: ${item.desc}${unidadActual}\n${combinedContext}`;
        });
        
        const bloquesContexto = await Promise.all(contextPromises);

        const prompt = `Eres Auditor de Costos de Construcción 2026. Valora estas TAREAS de obra.

REGLAS PARA ASIGNAR PRECIO (ORDEN DE PRIORIDAD):
1. BASE ADIR OFICIAL: Si existe dato "BASE DE PRECIOS ADIR", úsalo como PRECIO BASE. Es la referencia interna prioritaria.
2. HISTÓRICO REAL: Si no hay base ADIR pero hay "HISTÓRICOS ADJUDICADOS", úsalos como precio.
3. CYPE MURCIA: Solo como referencia de mercado si no hay datos internos.
4. Si ninguna fuente tiene dato, estima el precio razonable para Murcia 2026.

REGLAS PARA ASIGNAR OFICIO (lista OFICIOS POSIBLES):
1. Siempre elige UN gremio de la lista "OFICIOS POSIBLES".
2. Fontanería: bañera, grifo, PVC, tubo, sanitario, desagüe.
3. Carpintería de Madera: puertas, muebles, tarima, parquet.
4. Demolición: derribar, tirar, desmontar, demoler.
5. Electricidad: cable, cuadro eléctrico, enchufe, interruptor, luminaria.
6. Albañilería: tabique, ladrillo, mortero, enlucido, revoco.
7. Solados y Alicatados: suelo, pavimento, cerámica, porcelánico, gres.
8. Pintura: pintar, pintura, imprimación, barniz.

REGLAS PARA ASIGNAR UNIDAD:
- Si la partida ya tiene UNIDAD ACTUAL asignada, mantenla sin cambiarla.
- Si UNIDAD ACTUAL está "(sin asignar)", elige la más apropiada:
  * "ud": trabajos completos (instalar cocina, sanitario, puerta, ventana, aparato), cuando son unidades contables
  * "m2": superficies (pintura, alicatado, solado, falso techo, impermeabilización, enfoscado)
  * "ml": lineales (rodapiés, tubería, perfil, canaleta, zócalo, bajante)
  * "m3": volúmenes (excavación, relleno, hormigón, movimiento de tierras)
  * "kg": peso (acero, ferralla, escombros en tonelaje pequeño)
  * "t": toneladas (escombros, áridos en grande)
  * "h": horas (asistencia técnica, mano de obra genérica)
  * "pa": partida alzada (presupuesto global sin medición exacta)
  * "mes": trabajos continuados por mes (limpieza periódica, vigilancia)

OFICIOS POSIBLES: ${oficiosDisponibles}

Responde ÚNICAMENTE con JSON válido:
{"asignaciones": {
  "<TAREA ID>": {
    "oficio": "<gremio de la lista>",
    "precio": <numero sin simbolo €>,
    "unidad": "<unidad elegida>",
    "justificacion": "<Base ADIR / Histórico / CYPE / Estimación — una línea>"
  }
}}

PAQUETE DE EVALUACIÓN:
${bloquesContexto.join('\n\n---\n\n')}`;

        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
                model: 'mistral-small-latest',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.1,
                response_format: { type: 'json_object' }
            })
        });

        if (response.ok) {
            const data = await response.json();
            const content = JSON.parse(data.choices?.[0]?.message?.content || '{}');
            const lote = content.asignaciones || {};
            
            batch.forEach(item => {
                const info = lote[item.id]; // Usar ID único en lugar de la descripción evita fallos tipográficos de Mistral
                if (info && info.oficio && info.oficio !== "Sin asignar") {
                    asignacionesFinales[item.cap] = {
                        oficio: info.oficio,
                        precio: info.precio || 0,
                        unidad: info.unidad || 'ud',
                        justificacion: info.justificacion || "S/Ref",
                        needsQuote: (info.precio === 0)
                    };
                }
            });
        }
        onProgress?.({ status: 'progress', progress: Math.round(((i + batch.length) / itemsParaIA.length) * 100) });
    }

    return { asignaciones: asignacionesFinales, sinProveedor: [] };
};
