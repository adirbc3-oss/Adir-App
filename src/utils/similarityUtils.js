/**
 * similarityUtils.js
 * Detección de partidas similares/duplicadas entre listas de precios.
 *
 * Técnica: Jaccard sobre tokens normalizados con bonus para coincidencia
 * de números y magnitudes (ej. "50kg" se trata como token especial).
 *
 * Ejemplos que detecta como similares (score > 0.65):
 *   "saco 50kg hormigon h-50"  ↔  "hormigon h-50 50kg"       → 0.75
 *   "pintura plastica blanca 15L" ↔ "pintura blanca plastica 15l" → 0.80
 *   "baldosa gres 60x60"       ↔  "gres porcelanico 60x60"   → 0.68
 */

// ── Stopwords construcción (ES) ───────────────────────────────────────────────
const STOPWORDS = new Set([
  'de','la','el','los','las','un','una','unos','unas','para','con','en',
  'por','a','y','e','o','del','al','se','su','sus','le','les','que','lo',
  'es','son','si','no','ni','sin','ante','bajo','cada','como','entre',
  'hasta','segun','sobre','tras','vs','tipo','serie','modelo','ref',
  'referencia','articulo','art','codigo','cod','nuevo','nueva',
  'color','acabado','calidad','profesional','standard','extra','super',
  'interior','exterior','especial','normal','alto','baja','alta','bajo',
]);

// ── Normalización ─────────────────────────────────────────────────────────────

/**
 * Normaliza un string para comparación:
 * - minúsculas
 * - quita tildes
 * - unifica separadores (-, /, _, x entre números → 'x')
 * - quita stopwords
 * - tokeniza
 * Devuelve un Set de tokens.
 */
export function tokenizar(texto) {
  if (!texto) return new Set();

  let s = texto.toLowerCase()
    // Quitar tildes
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    // Unificar guiones y barras dentro de palabras compuestas
    .replace(/([a-z0-9])[_\-/]([a-z0-9])/g, '$1$2')
    // Normalizar "60x60", "60X60" → "60x60"
    .replace(/(\d+)\s*[xX×]\s*(\d+)/g, '$1x$2')
    // Unir número+unidad: "50 kg" → "50kg", "1,5 m2" → "1.5m2"
    .replace(/(\d+[.,]?\d*)\s*(kg|g|l|lt|m2|m3|m²|m³|ml|m\b|cm|mm|h\b|ud|tn|t\b)/gi,
      (_, n, u) => n.replace(',', '.') + u.toLowerCase())
    // Reemplazar coma decimal por punto
    .replace(/(\d+),(\d+)/g, '$1.$2')
    // Solo alfanumérico y espacios
    .replace(/[^a-z0-9\s.]/g, ' ')
    .replace(/\s+/g, ' ').trim();

  const tokens = s.split(' ').filter(t => t.length >= 2 && !STOPWORDS.has(t));
  return new Set(tokens);
}

// ── Similitud Jaccard ─────────────────────────────────────────────────────────

/**
 * Similitud de Jaccard entre dos Sets de tokens.
 * Resultado en [0, 1].
 */
export function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;

  let inter = 0;
  for (const t of setA) { if (setB.has(t)) inter++; }
  const union = setA.size + setB.size - inter;
  return inter / union;
}

/**
 * Similitud compuesta entre dos descripciones de partidas.
 * Añade bonus si coinciden números importantes (dimensiones, capacidades).
 */
export function similitudPartidas(descA, descB) {
  const tA = tokenizar(descA);
  const tB = tokenizar(descB);
  let score = jaccardSimilarity(tA, tB);

  // Bonus/penalización por números: si hay números distintos → penalizar
  const numRe = /\b\d+(?:\.\d+)?(?:x\d+(?:\.\d+)?)?\b/g;
  const numsA = new Set((descA.toLowerCase().match(numRe) || []));
  const numsB = new Set((descB.toLowerCase().match(numRe) || []));

  if (numsA.size > 0 && numsB.size > 0) {
    // Si tienen números y ninguno coincide → penalizar bastante (son tallas diferentes)
    let numInter = 0;
    for (const n of numsA) { if (numsB.has(n)) numInter++; }
    const numUnion = numsA.size + numsB.size - numInter;
    const numScore = numInter / numUnion;
    if (numScore === 0) score *= 0.5; // dimensiones completamente distintas
    else score = score * 0.7 + numScore * 0.3; // combinar
  }

  return Math.min(1, score);
}

// ── Búsqueda de similares en un listado ──────────────────────────────────────

const THRESHOLD_IGUAL   = 0.80; // muy probable que sea la misma partida
const THRESHOLD_SIMILAR = 0.55; // posible duplicado

/**
 * Para cada partida en `nuevas`, busca la más similar en `existentes`.
 *
 * @param {Array} nuevas       - [{descripcion_corta, precio_total, ...}]
 * @param {Array} existentes   - [{descripcion_corta, precio_total, codigo, ...}]
 * @returns {Array} nuevas con campo `match`:
 *   null                    → no hay similar
 *   { tipo: 'igual', score, existente }   → score >= THRESHOLD_IGUAL
 *   { tipo: 'similar', score, existente } → score >= THRESHOLD_SIMILAR
 */
export function detectarSimilares(nuevas, existentes) {
  // Pre-tokenizar existentes (costoso hacerlo en cada comparación)
  const existentesTokenizados = existentes.map(e => ({
    ...e,
    _tokens: tokenizar(e.descripcion_corta || ''),
  }));

  return nuevas.map(nueva => {
    const tNueva = tokenizar(nueva.descripcion_corta || '');
    let bestScore = 0;
    let bestExistente = null;

    for (const ex of existentesTokenizados) {
      // Quick pre-filter: si no comparten al menos 1 token → saltar
      let hasCommon = false;
      for (const t of tNueva) { if (ex._tokens.has(t)) { hasCommon = true; break; } }
      if (!hasCommon) continue;

      const score = similitudPartidas(nueva.descripcion_corta, ex.descripcion_corta || '');
      if (score > bestScore) {
        bestScore = score;
        bestExistente = ex;
      }
    }

    let match = null;
    if (bestScore >= THRESHOLD_IGUAL) {
      match = { tipo: 'igual', score: bestScore, existente: bestExistente };
    } else if (bestScore >= THRESHOLD_SIMILAR) {
      match = { tipo: 'similar', score: bestScore, existente: bestExistente };
    }

    return { ...nueva, match };
  });
}

/**
 * Detecta duplicados DENTRO de la misma lista recién importada.
 * Devuelve índices de filas que son duplicados (se pueden marcar o fusionar).
 * @param {Array} partidas
 * @returns {Map<number, number>} mapa idx → idx del original
 */
export function detectarDuplicadosInternos(partidas) {
  const dupes = new Map(); // idx duplicado → idx original
  for (let i = 0; i < partidas.length; i++) {
    if (dupes.has(i)) continue; // ya marcado como dupe
    for (let j = i + 1; j < partidas.length; j++) {
      if (dupes.has(j)) continue;
      const score = similitudPartidas(
        partidas[i].descripcion_corta,
        partidas[j].descripcion_corta
      );
      if (score >= THRESHOLD_IGUAL) dupes.set(j, i);
    }
  }
  return dupes;
}
