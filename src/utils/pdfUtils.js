import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { logoBase64 } from '../assets/logoBase64';

// ─── Colores corporativos ADIR ───────────────────────────────────────────────
const AZUL        = [30, 64, 175];   // Azul principal
const AZUL_LIGHT  = [239, 246, 255]; // Fondo azul claro
const VERDE       = [22, 163, 74];   // Verde firma/aprobado
const GRIS_TEXTO  = [80, 80, 80];
const GRIS_MUTED  = [140, 140, 140];
const GRIS_FILA   = [248, 249, 252]; // Fila alternada tabla

/**
 * Genera un PDF de presupuesto con diseño corporativo ADIR unificado.
 * Usado por: Borradores, PresupuestoCliente (portal), PresupuestosFirmados, Proyectos.
 *
 * @param {Object} data
 * @param {string}  data.cliente         - Nombre del cliente
 * @param {string}  data.propuesta_id    - ID del proyecto (referencia)
 * @param {string}  data.descripcion     - Descripción del proyecto
 * @param {Array}   data.partidas        - Array de partidas del presupuesto
 * @param {number}  data.precio_total    - Total del presupuesto
 * @param {string}  [data.fecha]         - Fecha del documento (ISO o legible)
 * @param {string}  [data.token]         - Token de referencia (8 chars)
 * @param {string}  [data.titulo]        - Título del doc ("Borrador" / "Presupuesto de Obra")
 * @param {string}  [data.firma_base64]  - Base64 de la firma (activa sección firma)
 * @param {string}  [data.fecha_firma]   - Fecha de firma (ISO)
 * @returns {jsPDF}
 */
export function generarPresupuestoPDF(data) {
    const {
        cliente       = 'Sin especificar',
        propuesta_id  = '',
        descripcion   = '',
        partidas      = [],
        precio_total  = 0,
        fecha         = new Date().toISOString(),
        token         = '',
        titulo        = 'Presupuesto de Obra',
        firma_base64  = null,
        fecha_firma   = null,
    } = data;

    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const W = 210; // ancho A4

    // ── 1. CABECERA ────────────────────────────────────────────────────────────
    // Fondo azul superior
    doc.setFillColor(...AZUL);
    doc.rect(0, 0, W, 38, 'F');

    // Logo
    try {
        doc.addImage(logoBase64, 'JPEG', 8, 6, 24, 24);
    } catch (_) { /* sin logo no bloquea */ }

    // Nombre empresa
    doc.setFontSize(20);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.text('ADIR REFORMAS', 38, 18);

    // Subtítulo
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(titulo.toUpperCase(), 38, 26);

    // Badge firmado (solo si hay firma)
    if (firma_base64) {
        doc.setFillColor(...VERDE);
        doc.roundedRect(W - 52, 10, 46, 16, 3, 3, 'F');
        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('FIRMADO DIGITALMENTE', W - 49, 20);
    }

    // ── 2. DATOS CLIENTE ───────────────────────────────────────────────────────
    const fechaFormateada = (() => {
        try { return new Date(fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'long', year: 'numeric' }); }
        catch (_) { return fecha; }
    })();

    doc.setFillColor(...AZUL_LIGHT);
    doc.rect(0, 38, W, 32, 'F');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...AZUL);
    doc.text('CLIENTE', 14, 48);
    doc.text('PROYECTO', 90, 48);
    doc.text('FECHA', 155, 48);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...GRIS_TEXTO);
    doc.setFontSize(10);
    doc.text(cliente.substring(0, 35), 14, 55);
    doc.text((descripcion || propuesta_id).substring(0, 30), 90, 55);
    doc.text(fechaFormateada, 155, 55);

    doc.setFontSize(8);
    doc.setTextColor(...GRIS_MUTED);
    doc.text('Ref: ' + (token ? token.substring(0, 8).toUpperCase() : propuesta_id.substring(0, 8)), 14, 63);

    // ── 3. TABLA DE PARTIDAS ───────────────────────────────────────────────────
    const filas = [];
    (partidas || []).forEach(p => {
        const esCapitulo = p.Capítulo?.endsWith('#') || p.Capitulo?.endsWith('#');
        const cap    = (p.Capítulo || p.Capitulo || '').replace(/#+/g, '').trim();
        const desc   = (p.Descripción || p.Descripcion || p.texto_partida || '').substring(0, 100);
        const precio = parseFloat(p['Precio Total (€)'] || p.precio || 0);
        const cant   = parseFloat(p.Cantidad || p.cantidad || 1);
        const unidad = p['Unidad IA'] || p.unidad || 'ud';

        if (esCapitulo) {
            filas.push([
                { content: cap, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: AZUL } },
                { content: desc, styles: { fontStyle: 'bold', fillColor: [226, 232, 240], textColor: GRIS_TEXTO, colSpan: 2 } },
                { content: '', styles: { fillColor: [226, 232, 240] } },
            ]);
        } else {
            filas.push([
                { content: cap, styles: { halign: 'center' } },
                desc,
                { content: cant + ' ' + unidad, styles: { halign: 'center' } },
                { content: precio.toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €', styles: { halign: 'right', fontStyle: precio > 0 ? 'normal' : 'italic', textColor: precio > 0 ? GRIS_TEXTO : GRIS_MUTED } },
            ]);
        }
    });

    autoTable(doc, {
        startY: 75,
        head: [['Cap.', 'Descripción de la Partida', 'Cantidad', 'Precio (€)']],
        body: filas,
        theme: 'plain',
        headStyles: {
            fillColor: AZUL,
            textColor: [255, 255, 255],
            fontStyle: 'bold',
            fontSize: 9,
            cellPadding: 4,
        },
        bodyStyles: {
            fontSize: 8.5,
            cellPadding: 3,
            lineWidth: 0.1,
            lineColor: [220, 224, 235],
        },
        alternateRowStyles: { fillColor: GRIS_FILA },
        columnStyles: {
            0: { cellWidth: 18, halign: 'center' },
            2: { cellWidth: 22, halign: 'center' },
            3: { cellWidth: 32, halign: 'right' },
        },
        margin: { left: 14, right: 14 },
    });

    // ── 4. TOTAL ───────────────────────────────────────────────────────────────
    const tableEnd = (doc.lastAutoTable?.finalY || 80) + 8;
    const totalStr = parseFloat(precio_total || 0).toLocaleString('es-ES', { minimumFractionDigits: 2 }) + ' €';

    doc.setFillColor(...AZUL_LIGHT);
    doc.roundedRect(W - 90, tableEnd - 2, 76, 18, 3, 3, 'F');
    doc.setDrawColor(...AZUL);
    doc.setLineWidth(0.5);
    doc.roundedRect(W - 90, tableEnd - 2, 76, 18, 3, 3, 'S');

    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...AZUL);
    doc.text('TOTAL PRESUPUESTO', W - 87, tableEnd + 5);

    doc.setFontSize(14);
    doc.text(totalStr, W - 16, tableEnd + 13, { align: 'right' });

    // ── 5. SECCIÓN DE FIRMA (solo si existe) ───────────────────────────────────
    let nextY = tableEnd + 28;

    if (firma_base64) {
        const fechaFirmaStr = (() => {
            try { return new Date(fecha_firma).toLocaleString('es-ES'); }
            catch (_) { return ''; }
        })();

        // Marco firma
        doc.setFillColor(240, 253, 244);
        doc.roundedRect(14, nextY, W - 28, 55, 4, 4, 'F');
        doc.setDrawColor(...VERDE);
        doc.setLineWidth(0.6);
        doc.roundedRect(14, nextY, W - 28, 55, 4, 4, 'S');

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(...VERDE);
        doc.text('✓  FIRMADO DIGITALMENTE POR EL CLIENTE', 20, nextY + 8);

        // Imagen de firma
        try {
            doc.addImage(firma_base64, 'PNG', 18, nextY + 12, 80, 30);
        } catch (_) {}

        // Texto de certificación
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        doc.setTextColor(...GRIS_MUTED);
        doc.text('Firmado por: ' + cliente, 110, nextY + 18);
        doc.text('Fecha: ' + fechaFirmaStr, 110, nextY + 25);
        doc.text('Ref: ' + (token || propuesta_id).substring(0, 8).toUpperCase(), 110, nextY + 32);
        doc.text('Firma electrónica con valor legal equivalente a firma manuscrita.', 110, nextY + 39);

        nextY += 62;
    }

    // ── 6. CLÁUSULA LEGAL ──────────────────────────────────────────────────────
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...GRIS_MUTED);
    const clausula = 'Este presupuesto tiene una validez de 30 días desde su fecha de emisión. ' +
        'Los precios incluyen materiales y mano de obra salvo indicación contraria. ' +
        'ADIR Reformas — CIF/NIF disponible bajo solicitud.';
    const clausulaLines = doc.splitTextToSize(clausula, W - 28);
    doc.text(clausulaLines, 14, nextY);

    // ── 7. PIE DE PÁGINA ───────────────────────────────────────────────────────
    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setDrawColor(200, 210, 230);
        doc.setLineWidth(0.3);
        doc.line(14, 285, W - 14, 285);
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(...GRIS_MUTED);
        doc.text('ADIR REFORMAS  |  oscarcanovasalcazar2@gmail.com', 14, 290);
        doc.text(`Pág. ${i} / ${pageCount}`, W - 14, 290, { align: 'right' });
    }

    return doc;
}

/**
 * Descarga un documento jsPDF con nombre correcto y extensión .pdf.
 * Usa dataURIstring + <a download> para máxima compatibilidad.
 * @param {jsPDF} doc
 * @param {string} filename - sin extensión (se añade .pdf automáticamente)
 */
export function descargarPDF(doc, filename) {
    const safeName = (filename || 'documento').replace(/[^a-zA-Z0-9_\-. ]/g, '_');
    const finalName = safeName.endsWith('.pdf') ? safeName : safeName + '.pdf';

    // Método 1: dataURIstring (más fiable para el nombre del fichero)
    try {
        const dataUri = doc.output('datauristring');
        const link = document.createElement('a');
        link.href = dataUri;
        link.download = finalName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => document.body.removeChild(link), 200);
        return;
    } catch (_) {}

    // Método 2: Blob + createObjectURL
    try {
        const blob = doc.output('blob');
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = finalName;
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        return;
    } catch (_) {}

    // Fallback
    doc.save(finalName);
}
