/**
 * Web Worker para parsear archivos BC3 sin bloquear el hilo principal.
 * Recibe el texto del BC3 y devuelve el array de partidas parseadas.
 */
const parseBC3Worker = (text) => {
    const lines = text.split(/\r?\n/);
    const conceptos = {};
    const childrenMap = {};

    for (const line of lines) {
        if (!line.trim()) continue;
        const parts = line.split('|');
        const tag = parts[0];

        if (tag === '~C') {
            const codigo = parts[1]?.trim();
            if (!codigo) continue;
            const unidad = parts[2]?.trim() || '';
            const desc   = parts[3]?.trim() || '';
            let precio    = parseFloat((parts[4] || '0').replace(',', '.'));
            if (isNaN(precio)) precio = 0;
            conceptos[codigo]   = { Capítulo: codigo, Unidad: unidad, Descripción: desc, precio };
            childrenMap[codigo] = childrenMap[codigo] || [];

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

        } else if (tag === '~T') {
            const codigo = parts[1]?.trim();
            const texto  = parts.slice(2).join('|').trim();
            if (conceptos[codigo] && texto) conceptos[codigo].Descripción = texto;
        }
    }

    // Detectar nodos raíz
    const isChild = new Set();
    for (const cod in childrenMap) {
        for (const c of childrenMap[cod]) isChild.add(c.cod);
    }
    const roots = Object.keys(conceptos).filter(cod => !isChild.has(cod));

    // DFS iterativo con detección de ciclos por ancestros
    const filas = [];
    const stack = roots.map(cod => ({ cod, cantidad: 1, ancestros: [] }));
    let contador = 0;

    while (stack.length > 0) {
        if (contador++ > 25000) break;

        const { cod, cantidad, ancestros } = stack.pop();
        if (ancestros.includes(cod)) continue;

        const concepto = conceptos[cod];
        if (!concepto) continue;

        const myChildren = (childrenMap[cod] || []).filter(c => conceptos[c.cod]);
        const hasChildren = myChildren.length > 0;

        const numCap     = hasChildren && !cod.endsWith('#') ? cod + '#' : cod;
        const precioBase = concepto.precio || 0;
        const cant       = cantidad || 1;
        const total      = hasChildren ? precioBase : precioBase * cant;

        filas.push({
            Capítulo: numCap,
            Descripción: concepto.Descripción || '',
            Unidad: concepto.Unidad || '',
            Cantidad: cant,
            'Precio Total (€)': total,
            'Precio Unitario base': precioBase,
            'Oficio Asignado': 'Sin asignar'
        });

        if (hasChildren) {
            const newAncestros = [...ancestros, cod];
            for (let i = myChildren.length - 1; i >= 0; i--) {
                stack.push({ cod: myChildren[i].cod, cantidad: myChildren[i].cantidad, ancestros: newAncestros });
            }
        }
    }

    return filas;
};

// Web Worker message handler
self.onmessage = (e) => {
    try {
        const { text } = e.data;
        const result = parseBC3Worker(text);
        self.postMessage({ success: true, data: result });
    } catch (err) {
        self.postMessage({ success: false, error: err.message });
    }
};
