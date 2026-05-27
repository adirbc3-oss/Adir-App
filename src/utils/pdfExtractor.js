/**
 * pdfExtractor.js
 * Extrae partidas de materiales/obra de un PDF de tarifa de precios.
 * Diseñado para ser lo más universal posible: funciona con diferentes
 * formatos de diferentes proveedores (BIGMAT, Leroy Merlin, Sodimac, etc.)
 *
 * Estrategia:
 *  1. Extraer texto del PDF agrupado por filas (misma posición Y).
 *  2. Para cada fila, detectar precio, unidad y descripción mediante heurísticas.
 *  3. Limpiar y descartar filas que no son partidas (cabeceras, totales, pies…).
 */

import * as pdfjsLib from 'pdfjs-dist';

// Worker — Vite resuelve la URL estática del worker de pdfjs
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).href;

// ── Constantes ────────────────────────────────────────────────────────────────

// Unidades de medida habituales en construcción / materiales
const UNIDADES_RE = /^(ud|u|unid|unidades?|m2|m²|m³|m3|ml|m\b|mt|kg|gr|g\b|tn|t\b|l\b|lt|litros?|h\b|hora|jornada|jorn|gl|pa|partida|rollo|caja|bote|saco|palé|palet|juego|set|pk|paq|pack|bl|bl\.|plac|pieza|pz|lamina|lam|bobina|bob)$/i;

// Precio: número con decimales (coma o punto), con o sin € delante/detrás
// Captura el número en grupo 1
const PRICE_RE = /(?:^|[\s;|€$£])([0-9]{1,8}[.,][0-9]{1,4})(?:\s*€|\s*EUR)?(?:\s|$|;|\|)/;

// Número sin decimales que podría ser precio redondo (ej: "15 €")
const PRICE_INTEGER_RE = /(?:^|[\s;|€$£])([0-9]{1,6})\s*€/;

// Líneas que son claramente NO partidas
const SKIP_PATTERNS = [
  /^pág(ina)?\.?\s*\d/i,
  /^página\s*\d/i,
  /^\d+\s*\/\s*\d+$/, // "1 / 24"
  /^(tarifa|lista\s*de\s*precios?|precios?\s*de\s*venta|pvp|iva|total|subtotal|descuento|dto\.?|precio\s*neto|precio\s*base)/i,
  /^(referencia|ref\.?|código|cod\.?|descripción|descripcion|unidad|precio)\s*$/i,
  /^\s*$/, // vacía
];

// ── Extracción de texto del PDF ───────────────────────────────────────────────

/**
 * Lee un File (PDF) y devuelve un array de objetos:
 *   { lineText: string, items: [{x, y, text}], pageNum }
 * Agrupados por fila (posición Y, tolerancia ±3px).
 */
export async function extraerLineasDePDF(file) {
  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: buffer, verbosity: 0 });
  const pdf = await loadingTask.promise;

  const allLines = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent({ includeMarkedContent: false });

    // Agrupar items por Y (tolerancia 3px para items en la misma línea)
    const rows = {}; // yKey → [{x, text}]
    for (const item of content.items) {
      if (!item.str?.trim()) continue;
      const rawY = item.transform[5];
      // Redondear Y al múltiplo de 3 más cercano para agrupar
      const yKey = Math.round(rawY / 3) * 3;
      if (!rows[yKey]) rows[yKey] = [];
      rows[yKey].push({ x: item.transform[4], text: item.str.trim() });
    }

    // Ordenar por Y descendente (PDF: Y crece hacia arriba)
    const yKeys = Object.keys(rows).map(Number).sort((a, b) => b - a);
    for (const yKey of yKeys) {
      const items = rows[yKey].sort((a, b) => a.x - b.x);
      const lineText = items.map(i => i.text).join('  ').replace(/\s{3,}/g, '  ').trim();
      if (lineText) allLines.push({ lineText, items, pageNum: p, y: yKey });
    }
  }

  return allLines;
}

// ── Helpers de parsing de precio por item ────────────────────────────────────

/**
 * Intenta parsear un texto de item como precio numérico.
 * Soporta formatos: "4,75" "4.75" "1.250,00" "1,250.00" "15" (solo si hay € cerca).
 * Devuelve el número o null si no es un precio válido.
 */
function parsePrecioItem(text) {
  const t = text.trim();
  // Ignorar textos no numéricos o demasiado cortos
  if (!t || !/[0-9]/.test(t)) return null;

  // Formato español con miles: "1.250,00" o "12.345,6"
  if (/^[0-9]{1,3}(\.[0-9]{3})+,[0-9]{1,2}$/.test(t)) {
    return parseFloat(t.replace(/\./g, '').replace(',', '.'));
  }
  // Formato inglés con miles: "1,250.00"
  if (/^[0-9]{1,3}(,[0-9]{3})+\.[0-9]{1,2}$/.test(t)) {
    return parseFloat(t.replace(/,/g, ''));
  }
  // Decimal simple: "4,75" o "4.75" (sin separador de miles)
  if (/^[0-9]{1,8}[,.][0-9]{1,4}$/.test(t)) {
    return parseFloat(t.replace(',', '.'));
  }
  // Entero puro: solo si va acompañado de € en el propio texto
  if (/^[0-9]{1,6}€$/.test(t)) {
    return parseFloat(t.replace('€', ''));
  }
  // Entero con € separado por espacio — se maneja en el bucle del caller
  if (/^[0-9]{1,6}$/.test(t)) {
    return null; // enteros solos no son precios sin confirmación de €
  }
  return null;
}

// ── Parser universal de partidas ──────────────────────────────────────────────

/**
 * A partir de las líneas del PDF, extrae partidas {descripcion, unidad, precio, pagina}.
 *
 * Estrategia columnar (más robusta que regex en lineText):
 *  1. Para cada fila, los items ya están ordenados de izquierda a derecha (X creciente).
 *  2. Escanear items desde la DERECHA: el primer item que sea un número con decimales
 *     es el precio (la columna de precios siempre está a la derecha en tarifas).
 *  3. Si el item inmediatamente a su derecha es "€" o "EUR", ignorarlo (es la unidad monetaria).
 *  4. Los items a la izquierda del precio forman la descripción + unidad.
 *  5. Si el método columnar no encuentra precio, fallback al regex sobre lineText completo.
 */
export function parsearPartidasDePDF(lineas) {
  const partidas = [];

  for (const { lineText, items, pageNum } of lineas) {
    // Descartar líneas de relleno
    if (SKIP_PATTERNS.some(re => re.test(lineText.trim()))) continue;
    if (lineText.length < 5) continue;
    if (!items || items.length === 0) continue;

    // ── Estrategia 1: búsqueda columnar (izquierda←derecha desde el final) ──
    let precio = null;
    let precioItemIdx = -1;

    // Recorrer items de derecha a izquierda buscando el precio
    for (let i = items.length - 1; i >= 0; i--) {
      const t = items[i].text.trim();
      // Saltar símbolos de moneda puros y textos muy cortos
      if (/^[€$£]$|^EUR$/i.test(t)) continue;
      // Saltar si es solo un número entero sin € (podría ser cantidad, referencia…)
      // EXCEPCIÓN: si el item a su derecha (ignorando €) es € → puede ser precio entero
      const candidato = parsePrecioItem(t);
      if (candidato !== null) {
        precio = candidato;
        precioItemIdx = i;
        break;
      }
      // Comprobar entero + € a continuación
      if (/^[0-9]{1,6}$/.test(t)) {
        const siguientes = items.slice(i + 1).map(x => x.text.trim());
        const tieneEuro = siguientes.some(s => /^[€$£]$|^EUR$/i.test(s));
        if (tieneEuro) {
          precio = parseFloat(t);
          precioItemIdx = i;
          break;
        }
      }
      // Si llegamos a un texto de descripción (>2 chars no-numéricos) sin encontrar precio,
      // no tiene sentido seguir buscando hacia la izquierda
      if (t.length > 2 && !/^[0-9.,]+$/.test(t) && !UNIDADES_RE.test(t)) break;
    }

    // ── Estrategia 2 (fallback): regex sobre lineText completo ───────────────
    if (precio === null) {
      const mDec = lineText.match(PRICE_RE);
      if (mDec) {
        precio = parseFloat(mDec[1].replace(',', '.'));
      } else {
        const mInt = lineText.match(PRICE_INTEGER_RE);
        if (mInt) precio = parseFloat(mInt[1]);
      }
    }

    // Sin precio válido → descartar línea
    if (precio === null || precio <= 0 || precio > 50000) continue;

    // ── Construir descripción con los items a la izquierda del precio ────────
    const descItems = precioItemIdx >= 0
      ? items.slice(0, precioItemIdx).filter(it => !/^[€$£]$|^EUR$/i.test(it.text.trim()))
      : items;

    let resto = descItems.map(it => it.text).join(' ').replace(/€|EUR/gi, '').replace(/\s{2,}/g, ' ').trim();

    // ── Detectar unidad ──────────────────────────────────────────────────────
    let unidad = 'ud';
    const tokens = resto.split(/\s+/);
    const unidadIdx = tokens.findIndex(t => UNIDADES_RE.test(t));
    if (unidadIdx !== -1) {
      unidad = tokens[unidadIdx].toLowerCase().replace('²', '2').replace('³', '3');
      tokens.splice(unidadIdx, 1);
    }

    // ── Descripción = lo que queda ───────────────────────────────────────────
    let descripcion = tokens.join(' ').replace(/\s{2,}/g, ' ').trim();

    // Limpiar referencias/códigos al inicio (ej: "12345 Cemento..." → "Cemento...")
    descripcion = descripcion.replace(/^[A-Z0-9\-\.]{3,15}\s+/i, '').trim();

    // Descartar si la descripción es demasiado corta o solo números
    if (descripcion.length < 4 || /^\d+$/.test(descripcion)) continue;

    // Normalizar unidad
    unidad = normalizarUnidad(unidad);

    partidas.push({
      descripcion_corta: descripcion.substring(0, 250),
      unidad,
      precio_total: Math.round(precio * 100) / 100,
      pagina: pageNum,
    });
  }

  return partidas;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normalizarUnidad(u) {
  const map = {
    'u': 'ud', 'unid': 'ud', 'unidades': 'ud', 'unidad': 'ud',
    'm2': 'm²', 'm3': 'm³', 'mt': 'ml',
    'gr': 'g', 'tn': 'Tn', 'lt': 'L', 'litro': 'L', 'litros': 'L',
    'hora': 'h', 'jornada': 'jorn', 'jorn': 'jorn',
    'palé': 'palet', 'bobina': 'bob', 'lam': 'lám', 'lamina': 'lám',
    'paq': 'pack', 'pk': 'pack', 'bl': 'bl',
  };
  return map[u.toLowerCase()] || u.toLowerCase();
}

/**
 * Función principal: recibe un File PDF y devuelve partidas parseadas.
 */
export async function extraerPartidasDePDF(file) {
  const lineas = await extraerLineasDePDF(file);
  return parsearPartidasDePDF(lineas);
}
