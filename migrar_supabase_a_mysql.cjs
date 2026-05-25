/**
 * MIGRACIÓN: Supabase → MySQL (Dinahosting)
 * ==========================================
 * Lee todos los datos de Supabase vía REST API y genera DOS ficheros:
 *   1. mysql_schema_dinahosting.sql  — estructura de tablas (ya existe)
 *   2. migracion_adir_datos_YYYY-MM-DD.sql — todos los datos
 *
 * USO:
 *   node migrar_supabase_a_mysql.cjs
 *
 * Importar en phpMyAdmin en este orden:
 *   1. mysql_schema_dinahosting.sql  (crea las tablas ctcon_*)
 *   2. migracion_adir_datos_*.sql    (inserta todos los datos)
 */

const SUPABASE_URL = 'https://mspejiongrdsgbqomewj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-_DqtXu-GQ97LecbJgLgqw_ADU_ZMzG';
const PREFIX = 'ctcon_';      // prefijo de tablas en la BD compartida
const fs = require('fs');

const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
};

// ─── Leer tabla completa con paginación ──────────────────────────────────────
async function fetchAll(table, select = '*') {
    const rows = [];
    let offset = 0;
    const limit = 1000;
    while (true) {
        const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}&limit=${limit}&offset=${offset}`;
        const res = await fetch(url, { headers });
        if (!res.ok) {
            const txt = await res.text();
            // Si la tabla no existe en Supabase, devuelve array vacío silenciosamente
            if (res.status === 404 || res.status === 400) { console.log(`  ⚠ ${table}: no encontrada o vacía`); break; }
            console.error(`  ✗ Error en ${table}:`, txt);
            break;
        }
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;
        rows.push(...data);
        if (data.length < limit) break;
        offset += limit;
    }
    console.log(`  ✓ ${table}: ${rows.length} filas`);
    return rows;
}

// ─── Escape seguro para MySQL ────────────────────────────────────────────────
function esc(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return isFinite(v) ? String(v) : 'NULL';
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (typeof v === 'object') v = JSON.stringify(v);
    return "'" + String(v)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\0/g, '\\0')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\x1a/g, '\\Z') + "'";
}

function dt(v) {
    if (!v) return 'NULL';
    const d = new Date(v);
    if (isNaN(d.getTime())) return 'NULL';
    return `'${d.toISOString().slice(0, 19).replace('T', ' ')}'`;
}

// ─── Generar bloque INSERT para una tabla ────────────────────────────────────
function genInserts(mysqlTable, rows, mapFn) {
    if (!rows.length) return `-- (sin datos en ${mysqlTable})\n\n`;
    const lines = [];
    lines.push(`-- ═══════════════════════════════════════`);
    lines.push(`-- ${mysqlTable}  (${rows.length} filas)`);
    lines.push(`-- ═══════════════════════════════════════`);
    // Desactivar FK checks y truncar para importación limpia
    lines.push(`SET FOREIGN_KEY_CHECKS = 0;`);
    lines.push(`TRUNCATE TABLE \`${mysqlTable}\`;`);
    lines.push(`SET FOREIGN_KEY_CHECKS = 1;`);

    let errCount = 0;
    for (const row of rows) {
        try {
            const mapped = mapFn(row);
            if (!mapped) continue;
            const cols = Object.keys(mapped).map(c => `\`${c}\``).join(', ');
            const vals = Object.values(mapped).join(', ');
            lines.push(`INSERT INTO \`${mysqlTable}\` (${cols}) VALUES (${vals});`);
        } catch (e) {
            errCount++;
            if (errCount <= 3) console.warn(`  ⚠ Error mapeando fila en ${mysqlTable}:`, e.message);
        }
    }
    if (errCount > 0) console.warn(`  ⚠ ${errCount} filas omitidas en ${mysqlTable}`);
    lines.push('');
    return lines.join('\n');
}

// ─── Limpieza del JSONB de partidas ─────────────────────────────────────────
function sanitizarPartidas(partidas) {
    if (!Array.isArray(partidas)) return partidas;
    return partidas.map(p => ({
        'Capítulo':              p['Capítulo'] || p.Capitulo || '',
        'Descripción':           p['Descripción'] || p.Descripcion || '',
        'Cantidad':              parseFloat(p.Cantidad) || 0,
        'Unidad IA':             p['Unidad IA'] || p.unidad || '',
        'precio_adjudicado':     parseFloat(p.precio_adjudicado ?? p['Precio Total (€)']) || 0,
        'precio_total_capitulo': parseFloat(p.precio_total_capitulo) || 0,
    }));
}

// ─── Mapeos: Supabase row → MySQL row ────────────────────────────────────────

const mapPropuesta = r => ({
    Proyecto:        esc(r.Proyecto),
    cliente:         esc(r.cliente),
    direccion:       esc(r.direccion),
    jefe_obra:       esc(r.jefe_obra),
    estado:          esc(r.estado || 'Borrador'),
    fecha_recepcion: dt(r.fecha_recepcion),
    descripcion:     esc(r.descripcion),
});

const mapPartida = r => {
    // Separar texto_partida "COD::Descripción"
    let capitulo_codigo = null, descripcion = null;
    if (r.texto_partida) {
        if (r.texto_partida.includes('::')) {
            const [cod, ...rest] = r.texto_partida.split('::');
            capitulo_codigo = cod.trim();
            descripcion = rest.join('::').replace(/\|/g, ' ').trim();
        } else {
            descripcion = r.texto_partida.replace(/\|/g, ' ').trim();
        }
    }
    return {
        id:                      esc(r.id),
        propuesta_id:            esc(r.propuesta_id),
        capitulo_codigo:         esc(capitulo_codigo),
        descripcion:             esc(descripcion),
        precio_base_estimado:    parseFloat(r.precio_base_estimado) || 0,
        precio_adjudicado:       r.precio_adjudicado != null ? parseFloat(r.precio_adjudicado) : 'NULL',
        cantidad:                parseFloat(r.cantidad) || 0,
        unidad:                  esc(r.unidad),
        oficio_asignado:         esc(r.oficio_asignado),
        proveedor_adjudicado_id: esc(r.proveedor_adjudicado_id),
        estado_adjudicacion:     esc(r.estado_adjudicacion),
        created_at:              dt(r.created_at) !== 'NULL' ? dt(r.created_at) : 'CURRENT_TIMESTAMP',
    };
};

const mapPresupuesto = r => {
    const partidasClean = sanitizarPartidas(r.partidas);
    return {
        id:                   esc(r.id),
        token:                esc(r.token),
        propuesta_id:         esc(r.propuesta_id),
        cliente_nombre:       esc(r.cliente_nombre),
        cliente_email:        esc(r.cliente_email),
        proyecto_descripcion: esc(r.proyecto_descripcion),
        partidas:             esc(partidasClean),   // JSON limpio
        precio_total:         parseFloat(r.precio_total) || 0,
        fecha_envio:          dt(r.fecha_envio) !== 'NULL' ? dt(r.fecha_envio) : 'CURRENT_TIMESTAMP',
        estado:               esc(r.estado || 'pendiente'),
        firma_url:            'NULL',
        firma_base64:         esc(r.firma_base64),
        fecha_firma:          dt(r.fecha_firma),
        detalles_rechazo:     esc(r.detalles_rechazo),
    };
};

const mapProveedor = r => ({
    id:               esc(r.id),
    nombre_empresa:   esc(r.nombre_empresa),
    oficio_principal: esc(r.oficio_principal),
    email:            esc(r.email),
    telefono:         esc(r.telefono),
    created_at:       dt(r.created_at) !== 'NULL' ? dt(r.created_at) : 'CURRENT_TIMESTAMP',
});

const mapSolicitud = r => ({
    id:               esc(r.id),
    propuesta_id:     esc(r.propuesta_id),
    proveedor_id:     esc(r.proveedor_id),
    proveedor_nombre: esc(r.proveedor_nombre),
    proveedor_email:  esc(r.proveedor_email),
    estado_solicitud: esc(r.estado_solicitud || 'Enviada'),
    created_at:       dt(r.created_at) !== 'NULL' ? dt(r.created_at) : 'CURRENT_TIMESTAMP',
});

const mapRespuesta = r => ({
    id:              esc(r.id),
    solicitud_id:    esc(r.solicitud_id),
    partida_id:      esc(r.partida_id),
    precio_ofertado: r.precio_ofertado != null ? parseFloat(r.precio_ofertado) : 'NULL',
    comentarios:     esc(r.comentarios),
    created_at:      dt(r.created_at) !== 'NULL' ? dt(r.created_at) : 'CURRENT_TIMESTAMP',
});

const mapHistorial = r => ({
    origen_cambio:       esc(r.origen_cambio),
    tipo_entidad:        esc(r.tipo_entidad),
    entidad_id:          esc(r.entidad_id),
    proyecto_referencia: esc(r.proyecto_referencia),
    campo_modificado:    esc(r.campo_modificado),
    valor_anterior:      esc(r.valor_anterior),
    valor_nuevo:         esc(r.valor_nuevo),
    detalles:            esc(r.detalles),
    created_at:          dt(r.created_at) !== 'NULL' ? dt(r.created_at) : 'CURRENT_TIMESTAMP',
    // id AUTO_INCREMENT: no lo insertamos, se asigna solo
});

const mapBasePrecios = r => ({
    id:                esc(r.id),
    codigo:            esc(r.codigo),
    descripcion_corta: esc(r.descripcion_corta),
    descripcion_larga: esc(r.descripcion_larga || r.descripcion || null),
    tags:              esc(r.tags),
    unidad:            esc(r.unidad),
    tipo_partida:      esc(r.tipo_partida),
    precio_total:      r.precio_total != null ? parseFloat(r.precio_total) : 'NULL',
    mano_de_obra:      r.mano_de_obra != null ? parseFloat(r.mano_de_obra) : 'NULL',
    ratio_mo:          r.ratio_mo    != null ? parseFloat(r.ratio_mo)    : 'NULL',
    origen:            esc(r.origen),
    created_at:        dt(r.created_at) !== 'NULL' ? dt(r.created_at) : 'CURRENT_TIMESTAMP',
});

const mapConfiguracion = r => ({
    clave: esc(r.clave),
    valor: esc(r.valor),
});

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
    console.log('🚀 Exportando Supabase → MySQL (prefijo: ' + PREFIX + ')\n');

    const [
        propuestas, partidas, presupuestos, proveedores,
        solicitudes, respuestas, historial, basePrecios, configuracion
    ] = await Promise.all([
        fetchAll('propuestas'),
        fetchAll('partidas'),
        fetchAll('presupuestos_cliente'),
        fetchAll('proveedores'),
        fetchAll('solicitudes'),
        fetchAll('respuestas'),
        fetchAll('historial_cambios'),
        fetchAll('base_precios'),
        fetchAll('configuracion'),
    ]);

    console.log('\n📊 Total filas exportadas:');
    const total = propuestas.length + partidas.length + presupuestos.length +
                  proveedores.length + solicitudes.length + respuestas.length +
                  historial.length + basePrecios.length + configuracion.length;
    console.log(`  ${total} filas en total`);

    // Avisar si hay presupuestos con firma grande
    const conFirma = presupuestos.filter(p => p.firma_base64 && p.firma_base64.length > 1000);
    if (conFirma.length > 0) {
        const kbTotal = presupuestos.reduce((s,p) => s + (p.firma_base64?.length || 0), 0) / 1024;
        console.log(`\n  ⚠ ${conFirma.length} firmas base64 detectadas (~${Math.round(kbTotal)} KB)`);
        console.log(`    Se migran a firma_base64. Después puedes moverlas a ficheros.`);
    }

    const fecha = new Date().toISOString().split('T')[0];
    const outFile = `migracion_adir_datos_${fecha}.sql`;

    const bloques = [
        `-- ============================================================`,
        `--  ADIR — Datos de migración Supabase → MySQL`,
        `--  Prefijo tablas: ${PREFIX}`,
        `--  BD destino: adirg_bbdd (Dinahosting)`,
        `--  Generado: ${new Date().toISOString()}`,
        `--  Total filas: ${total}`,
        `-- ============================================================`,
        `--`,
        `--  INSTRUCCIONES:`,
        `--  1. Importa PRIMERO: mysql_schema_dinahosting.sql`,
        `--  2. Importa DESPUÉS: este fichero`,
        `--  phpMyAdmin: Selecciona "adirg_bbdd" → Importar → Elegir archivo`,
        `--`,
        `-- ============================================================`,
        ``,
        `SET NAMES utf8mb4;`,
        `SET FOREIGN_KEY_CHECKS = 0;`,
        ``,
        // Orden: primero tablas sin FK, luego las dependientes
        genInserts(`${PREFIX}propuestas`,           propuestas,    mapPropuesta),
        genInserts(`${PREFIX}proveedores`,          proveedores,   mapProveedor),
        genInserts(`${PREFIX}partidas`,             partidas,      mapPartida),
        genInserts(`${PREFIX}presupuestos_cliente`, presupuestos,  mapPresupuesto),
        genInserts(`${PREFIX}solicitudes`,          solicitudes,   mapSolicitud),
        genInserts(`${PREFIX}respuestas`,           respuestas,    mapRespuesta),
        genInserts(`${PREFIX}historial_cambios`,    historial,     mapHistorial),
        genInserts(`${PREFIX}base_precios`,         basePrecios,   mapBasePrecios),
        genInserts(`${PREFIX}configuracion`,        configuracion, mapConfiguracion),
        `SET FOREIGN_KEY_CHECKS = 1;`,
        ``,
        `-- ============================================================`,
        `--  FIN DE LA MIGRACIÓN`,
        `-- ============================================================`,
    ].join('\n');

    fs.writeFileSync(outFile, bloques, 'utf8');

    const sizeKB  = Math.round(Buffer.byteLength(bloques, 'utf8') / 1024);
    const sizeMB  = (sizeKB / 1024).toFixed(1);

    console.log(`\n✅ Fichero generado: ${outFile}`);
    console.log(`   Tamaño: ${sizeKB} KB (${sizeMB} MB)`);

    if (sizeKB > 50000) {
        console.log(`\n  ⚠ El fichero supera 50 MB. phpMyAdmin tiene límite de 100 MB.`);
        console.log(`    Si falla, divide el fichero por tablas o usa BigDump:`);
        console.log(`    https://www.ozerov.de/bigdump/`);
    }

    console.log(`\n📌 Pasos en phpMyAdmin:`);
    console.log(`   1. Ir a: https://phpadmin.gestiondecuenta.com/52/index.php?route=/database/structure&db=adirg_bbdd`);
    console.log(`   2. Importar → mysql_schema_dinahosting.sql  (estructura)`);
    console.log(`   3. Importar → ${outFile}  (datos)`);
    console.log(`   4. Charset: utf-8  |  Formato: SQL`);
}

main().catch(err => {
    console.error('\n❌ Error fatal:', err.message);
    process.exit(1);
});
