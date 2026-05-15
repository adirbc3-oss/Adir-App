/**
 * bc3ToBasePrecios.js
 * Convierte un archivo BC3/FIEBDC-3 al formato de la tabla base_precios_adir.
 * - Extrae MO/Materiales/Maquinaria de la descomposición (~D) si está disponible.
 * - Si no hay descomposición, estima el desglose según el tipo de trabajo.
 * - Detecta categorías a partir de la jerarquía de capítulos del BC3.
 * - Clasifica cada partida como 'material', 'trabajo' o 'auxiliar'.
 */

// ── Clasificación tipo_partida ─────────────────────────────────────────────────
const PALABRAS_TRABAJO = [
  'instalacion','instalación','montaje','colocacion','colocación','demolicion',
  'demolición','excavacion','excavación','enfoscado','alicatado','solado',
  'pintado','tendido','ejecucion','ejecución','suministro e instalacion',
  'suministro e instalación','encofrado','hormigonado','ferrallado','replanteo',
  'impermeabilizacion','impermeabilización','aislamiento aplicado',
];
const PALABRAS_MATERIAL = [
  'cemento','arena','grava','mortero seco','yeso en polvo','escayola en polvo',
  'silicona','adhesivo','cola de','barniz','disolvente','imprimacion','imprimación',
  'saco de','kg de','litro de',
];
const UNIDADES_MATERIAL = new Set([
  'kg','g','tn','l','lt','ud','u','saco','pack','palet','rollo',
  'bob','lam','bl','bote','caja','juego','set','pieza','pz',
]);
const UNIDADES_TRABAJO = new Set(['m2','m²','m3','m³','ml','h','jorn','pa']);

/**
 * Clasifica una partida como 'material', 'trabajo', 'auxiliar' o 'desconocido'.
 */
export function clasificarTipo({ codigo, descripcion, unidad, mano_de_obra, materiales_y_otros, precio }) {
  const cod = (codigo || '').toUpperCase();
  const desc = (descripcion || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const ud = (unidad || '').toLowerCase();

  // Recursos elementales BC3 → auxiliar
  if (/^(MO|MOO|MANO|MQ|MAQ|MT|MAT|MA\d|AU|AUX)/.test(cod)) return 'auxiliar';

  // Si tiene mano de obra >= 15 % → trabajo
  if (precio > 0 && mano_de_obra > 0 && (mano_de_obra / precio) >= 0.15) return 'trabajo';

  // Sin MO + unidad de cantidad → material
  if ((mano_de_obra || 0) === 0 && (materiales_y_otros || 0) > 0 && UNIDADES_MATERIAL.has(ud)) return 'material';

  // Palabras de ejecución → trabajo
  if (PALABRAS_TRABAJO.some(p => desc.includes(p))) return 'trabajo';

  // Palabras de producto → material
  if (PALABRAS_MATERIAL.some(p => desc.includes(p))) return 'material';

  // Unidad de trabajo → trabajo
  if (UNIDADES_TRABAJO.has(ud)) return 'trabajo';

  // Unidad de material → material
  if (UNIDADES_MATERIAL.has(ud)) return 'material';

  return 'desconocido';
}

// ── Ratios de desglose estimados por tipo de trabajo ─────────────────────────
// Fuente: estudios de costes de construcción en España (media del sector).
const RATIOS_POR_CATEGORIA = [
  { keywords: ['movimiento', 'excavac', 'demolic', 'desmonte', 'vaciado', 'relleno', 'compactac'],
    ratio: { mo: 0.22, mat: 0.38, maq: 0.40 } },
  { keywords: ['cimentac', 'pilotos', 'zapatas', 'losa de ciment'],
    ratio: { mo: 0.30, mat: 0.62, maq: 0.08 } },
  { keywords: ['estructura', 'hormigon', 'forjado', 'viga', 'pilar', 'losa'],
    ratio: { mo: 0.35, mat: 0.60, maq: 0.05 } },
  { keywords: ['albañil', 'fabrica', 'ladrillo', 'bloque', 'tabique', 'muro', 'mamposteria'],
    ratio: { mo: 0.40, mat: 0.55, maq: 0.05 } },
  { keywords: ['cubierta', 'tejado', 'teja', 'pizarra'],
    ratio: { mo: 0.35, mat: 0.60, maq: 0.05 } },
  { keywords: ['impermeabiliz', 'lamina', 'membrana'],
    ratio: { mo: 0.30, mat: 0.67, maq: 0.03 } },
  { keywords: ['aislam', 'insulac', 'poliestireno', 'lana de roca', 'poliuretano'],
    ratio: { mo: 0.25, mat: 0.72, maq: 0.03 } },
  { keywords: ['carpinteria de madera', 'puerta', 'ventana madera', 'parquet'],
    ratio: { mo: 0.30, mat: 0.65, maq: 0.05 } },
  { keywords: ['carpinteria metalica', 'aluminio', 'pvc', 'carpinteria exterior'],
    ratio: { mo: 0.25, mat: 0.70, maq: 0.05 } },
  { keywords: ['cerraje', 'metalurgia', 'barandilla', 'reja'],
    ratio: { mo: 0.30, mat: 0.65, maq: 0.05 } },
  { keywords: ['vidrio', 'cristal', 'acristalamiento', 'vidrieria'],
    ratio: { mo: 0.22, mat: 0.76, maq: 0.02 } },
  { keywords: ['electric', 'instalacion electr', 'cableado', 'cuadro electr', 'luminaria'],
    ratio: { mo: 0.45, mat: 0.50, maq: 0.05 } },
  { keywords: ['fontaner', 'plomeria', 'tuberia', 'agua fria', 'agua caliente', 'acs'],
    ratio: { mo: 0.40, mat: 0.56, maq: 0.04 } },
  { keywords: ['saneam', 'alcantarill', 'red de evacu', 'pluviales', 'residuales'],
    ratio: { mo: 0.35, mat: 0.58, maq: 0.07 } },
  { keywords: ['climatiz', 'aire acondic', 'hvac', 'calefacc', 'aerotermia', 'bomba de calor'],
    ratio: { mo: 0.35, mat: 0.60, maq: 0.05 } },
  { keywords: ['gas', 'instalacion de gas', 'caldera'],
    ratio: { mo: 0.40, mat: 0.55, maq: 0.05 } },
  { keywords: ['revestim', 'alicatado', 'azulejo', 'ceramica', 'gresite', 'gres'],
    ratio: { mo: 0.40, mat: 0.56, maq: 0.04 } },
  { keywords: ['solado', 'pavimento', 'tarima', 'suelo', 'baldosa', 'marmol', 'porcelanato'],
    ratio: { mo: 0.35, mat: 0.61, maq: 0.04 } },
  { keywords: ['enlucido', 'yeso', 'escayola', 'estucos', 'guarnecido'],
    ratio: { mo: 0.47, mat: 0.50, maq: 0.03 } },
  { keywords: ['pintura', 'lacado', 'barniz', 'imprimacion'],
    ratio: { mo: 0.52, mat: 0.44, maq: 0.04 } },
  { keywords: ['urbaniz', 'pavimento exterior', 'acera', 'jardin', 'paisajismo'],
    ratio: { mo: 0.30, mat: 0.55, maq: 0.15 } },
];

const RATIO_DEFAULT = { mo: 0.35, mat: 0.60, maq: 0.05 };

/**
 * Devuelve el ratio estimado de desglose según la descripción/categoría.
 * Exportada para que pdfExtractor y el modal puedan usarla.
 */
export function getRatio(texto) {
  const t = (texto || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  for (const { keywords, ratio } of RATIOS_POR_CATEGORIA) {
    if (keywords.some(kw => t.includes(kw))) return ratio;
  }
  return RATIO_DEFAULT;
}

/**
 * Prefijos en BC3 que identifican el tipo de recurso en la descomposición:
 *  MO / MOO  → Mano de Obra
 *  MT / MAT / MA → Materiales
 *  MQ / MAQ  → Maquinaria
 *  AU / AUX  → Auxiliares (se suman a materiales)
 */
function tipoCodigo(cod) {
  const c = cod.toUpperCase();
  if (/^(MO[O]?|MANO)/.test(c)) return 'mo';
  if (/^(MQ|MAQ)/.test(c)) return 'maq';
  if (/^(MT|MAT|MA[0-9])/.test(c)) return 'mat';
  if (/^(AU|AUX)/.test(c)) return 'mat'; // auxiliares → materiales
  // Heurística extra: código numérico puro suele ser partida, no recurso
  return null; // desconocido → ignorar para el desglose
}

// ── Parser principal ──────────────────────────────────────────────────────────

/**
 * Parsea un texto BC3 y devuelve un array de objetos listos para
 * insertar/actualizar en la tabla `base_precios_adir`.
 *
 * Cada objeto tiene:
 *   { codigo, categoria, descripcion_corta, unidad,
 *     precio_total, mano_de_obra, materiales_y_otros, maquinaria,
 *     desglose_estimado (bool) }
 */
export function bc3ToBasePrecios(text) {
  const lines = text.split(/\r?\n/);
  const conceptos  = {}; // cod → { desc, unidad, precio }
  const childrenMap = {}; // cod → [{ cod, cantidad }]

  // ── Fase 1: leer ~C y ~D ──────────────────────────────────────────────────
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.split('|');
    const tag   = parts[0];

    if (tag === '~C') {
      const cod   = parts[1]?.trim();
      if (!cod) continue;
      const unidad  = parts[2]?.trim() || '';
      const desc    = parts[3]?.trim() || '';
      let   precio  = parseFloat((parts[4] || '0').replace(',', '.'));
      if (isNaN(precio)) precio = 0;
      conceptos[cod]   = { desc, unidad, precio };
      childrenMap[cod] = childrenMap[cod] || [];

    } else if (tag === '~D') {
      const padre = parts[1]?.trim();
      if (!padre) continue;
      let raw = (parts[2] || '').trim();
      if (raw.endsWith('\\')) raw = raw.slice(0, -1);
      childrenMap[padre] = childrenMap[padre] || [];
      const items = raw.split('\\');
      for (let i = 0; i < items.length; i += 3) {
        const hijoCod = items[i]?.trim();
        if (!hijoCod) continue;
        const factor = parseFloat((items[i + 1] || '1').replace(',', '.')) || 1;
        const rend   = parseFloat((items[i + 2] || '0').replace(',', '.')) || 0;
        childrenMap[padre].push({ cod: hijoCod, cantidad: factor * rend });
      }
    }
  }

  // ── Fase 2: construir parentMap (hijo → primer padre) ────────────────────
  const parentMap = {}; // cod → cod del padre directo
  for (const padre in childrenMap) {
    for (const { cod } of childrenMap[padre]) {
      if (!parentMap[cod]) parentMap[cod] = padre;
    }
  }

  // ── Fase 3: función para subir en la jerarquía hasta el capítulo ─────────
  function categoriaDe(cod) {
    let cur = cod;
    let nivel = 0;
    while (cur && nivel < 20) {
      const p = parentMap[cur];
      if (!p) break;
      if (p.endsWith('#')) return { cod: p, desc: conceptos[p]?.desc || p };
      cur = p;
      nivel++;
    }
    // Si no hay padre con #, usar el primer nodo padre disponible
    const primerPadre = parentMap[cod];
    if (primerPadre && conceptos[primerPadre]) {
      return { cod: primerPadre, desc: conceptos[primerPadre]?.desc || primerPadre };
    }
    return { cod: 'SIN_CATEGORIA', desc: 'Sin categoría' };
  }

  // ── Fase 4: calcular desglose de cada partida ─────────────────────────────
  /**
   * Para una partida (cod), recorre sus hijos directos del ~D record y
   * suma los precios según el tipo de recurso (MO/MAT/MAQ).
   * Si la suma no cuadra (no hay datos de descomposición con precios de recurso),
   * devuelve null → se estimará después.
   */
  function desgloseDesdeBC3(cod) {
    const hijos = childrenMap[cod] || [];
    if (hijos.length === 0) return null;

    let moTotal  = 0;
    let matTotal = 0;
    let maqTotal = 0;
    let reconocidos = 0;

    for (const { cod: hijoCod, cantidad } of hijos) {
      const tipo = tipoCodigo(hijoCod);
      if (!tipo) continue;
      const precioHijo = conceptos[hijoCod]?.precio || 0;
      const importeHijo = precioHijo * cantidad;
      reconocidos++;
      if (tipo === 'mo')  moTotal  += importeHijo;
      if (tipo === 'mat') matTotal += importeHijo;
      if (tipo === 'maq') maqTotal += importeHijo;
    }

    // Si reconocemos al menos un recurso con tipo y hay precio → usar datos reales
    if (reconocidos > 0 && (moTotal + matTotal + maqTotal) > 0) {
      return { mo: moTotal, mat: matTotal, maq: maqTotal, estimado: false };
    }
    return null; // no hay datos útiles de descomposición
  }

  // ── Fase 5: generar filas ─────────────────────────────────────────────────
  const filas = [];
  const isChild = new Set();
  for (const cod in childrenMap) {
    for (const c of childrenMap[cod]) isChild.add(c.cod);
  }

  for (const cod in conceptos) {
    // Saltamos capítulos/subcapítulos (terminan en #) — sólo queremos partidas
    if (cod.endsWith('#')) continue;
    // Saltamos recursos elementales que son hijos pero no son partidas
    const tipo = tipoCodigo(cod);
    if (tipo && !isChild.has(cod)) continue; // recurso huérfano

    const concepto = conceptos[cod];
    const precio   = concepto.precio || 0;

    // Categoría desde jerarquía
    const { desc: catDesc } = categoriaDe(cod);

    // Desglose
    let mo, mat, maq, estimado;
    const desgBC3 = desgloseDesdeBC3(cod);

    if (desgBC3) {
      mo       = parseFloat(desgBC3.mo.toFixed(4));
      mat      = parseFloat(desgBC3.mat.toFixed(4));
      maq      = parseFloat(desgBC3.maq.toFixed(4));
      estimado = false;
    } else {
      // Estimar según categoría + descripción
      const ratio = getRatio(catDesc + ' ' + concepto.desc);
      mo       = parseFloat((precio * ratio.mo).toFixed(4));
      mat      = parseFloat((precio * ratio.mat).toFixed(4));
      maq      = parseFloat((precio * ratio.maq).toFixed(4));
      estimado = true;
    }

    const tipo_partida = clasificarTipo({
      codigo: cod,
      descripcion: concepto.desc,
      unidad: concepto.unidad,
      mano_de_obra: mo,
      materiales_y_otros: mat,
      precio,
    });

    filas.push({
      codigo:            cod,
      categoria:         catDesc,
      descripcion_corta: concepto.desc,
      unidad:            concepto.unidad,
      precio_total:      precio,
      mano_de_obra:      mo,
      materiales_y_otros: mat,
      maquinaria:        maq,
      tipo_partida,
      fuente:            'BC3',
      fecha_actualizacion: new Date().toISOString().split('T')[0],
      desglose_estimado: estimado,
    });
  }

  return filas;
}
