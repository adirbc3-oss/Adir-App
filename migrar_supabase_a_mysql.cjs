/**
 * MIGRACIÓN: Supabase → MySQL (Dinahosting)
 * ==========================================
 * Columnas auditadas directamente contra Supabase REST API.
 * Tablas: propuestas, partidas, presupuestos_cliente, proveedores,
 *         solicitudes, respuestas, historial_cambios,
 *         base_precios_adir, PreciosCype, configuracion
 *
 * USO: node migrar_supabase_a_mysql.cjs
 */

const SUPABASE_URL = 'https://mspejiongrdsgbqomewj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-_DqtXu-GQ97LecbJgLgqw_ADU_ZMzG';
const PREFIX = 'ctcon_';
const fs = require('fs');

const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'count=exact'
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
            const txt = await res.text().catch(() => res.status);
            console.log(`  ⚠ ${table}: ${res.status} — ${txt.slice(0, 80)}`);
            break;
        }
        const data = await res.json();
        if (!Array.isArray(data) || data.length === 0) break;
        rows.push(...data);
        process.stdout.write(`\r  ↓ ${table}: ${rows.length} filas...`);
        if (data.length < limit) break;
        offset += limit;
    }
    const range = res => res;  // solo para mostrar
    console.log(`\r  ✓ ${table}: ${rows.length} filas           `);
    return rows;
}

// ─── Escape seguro para MySQL ─────────────────────────────────────────────────
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

function dateOnly(v) {
    if (!v) return 'NULL';
    const s = String(v).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `'${s}'` : 'NULL';
}

function num(v, def = 'NULL') {
    if (v === null || v === undefined || v === '') return def;
    const n = parseFloat(v);
    return isFinite(n) ? String(n) : def;
}

// ─── Sanitizar JSONB de partidas ─────────────────────────────────────────────
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

// ─── Separar texto_partida "COD::Desc" ───────────────────────────────────────
function splitTextoPart(texto) {
    if (!texto) return { codigo: null, desc: null };
    if (texto.includes('::')) {
        const [cod, ...rest] = texto.split('::');
        return { codigo: cod.trim(), desc: rest.join('::').replace(/\|/g, ' ').trim() };
    }
    return { codigo: null, desc: texto.replace(/\|/g, ' ').trim() };
}

// ─── Generar bloque INSERT ────────────────────────────────────────────────────
function genInserts(mysqlTable, rows, mapFn) {
    if (!rows.length) return `-- (sin datos en ${mysqlTable})\n\n`;
    const lines = [];
    lines.push(`-- ${'═'.repeat(50)}`);
    lines.push(`-- ${mysqlTable}  (${rows.length} filas)`);
    lines.push(`-- ${'═'.repeat(50)}`);
    lines.push(`SET FOREIGN_KEY_CHECKS = 0;`);
    lines.push(`TRUNCATE TABLE \`${mysqlTable}\`;`);
    lines.push(`SET FOREIGN_KEY_CHECKS = 1;`);

    let err = 0;
    for (const row of rows) {
        try {
            const m = mapFn(row);
            if (!m) continue;
            const cols = Object.keys(m).map(c => `\`${c}\``).join(', ');
            const vals = Object.values(m).join(', ');
            lines.push(`INSERT INTO \`${mysqlTable}\` (${cols}) VALUES (${vals});`);
        } catch (e) {
            err++;
            if (err <= 3) console.warn(`  ⚠ Error fila en ${mysqlTable}:`, e.message);
        }
    }
    if (err) console.warn(`  ⚠ ${err} filas omitidas en ${mysqlTable}`);
    lines.push('');
    return lines.join('\n');
}

// ─── MAPEOS ───────────────────────────────────────────────────────────────────

const mapPropuesta = r => ({
    Proyecto:        esc(r.Proyecto),
    cliente:         esc(r.cliente),
    direccion:       esc(r.direccion),
    jefe_obra:       esc(r.jefe_obra),
    estado:          esc(r.estado || 'Borrador'),
    fecha_recepcion: dt(r.fecha_recepcion) !== 'NULL' ? dt(r.fecha_recepcion) : 'CURRENT_TIMESTAMP',
    descripcion:     esc(r.descripcion),
});

const mapPartida = r => {
    const { codigo, desc } = splitTextoPart(r.texto_partida);
    return {
        id:                      esc(r.id),
        propuesta_id:            esc(r.propuesta_id),
        texto_partida:           esc(r.texto_partida),
        capitulo_codigo:         esc(codigo),
        descripcion:             esc(desc),
        precio_base_estimado:    num(r.precio_base_estimado, '0'),
        precio_adjudicado:       num(r.precio_adjudicado),
        precio_ia:               num(r.precio_ia),
        cantidad:                num(r.cantidad, '0'),
        unidad:                  esc(r.unidad),
        oficio_asignado:         esc(r.oficio_asignado),
        proveedor_adjudicado_id: esc(r.proveedor_adjudicado_id),
        estado_adjudicacion:     esc(r.estado_adjudicacion),
        force_quote:             r.force_quote ? '1' : '0',
        created_at:              'CURRENT_TIMESTAMP',
    };
};

const mapPresupuesto = r => ({
    id:                   esc(r.id),
    token:                esc(r.token),
    propuesta_id:         esc(r.propuesta_id),
    cliente_nombre:       esc(r.cliente_nombre),
    cliente_email:        esc(r.cliente_email),
    proyecto_descripcion: esc(r.proyecto_descripcion),
    partidas:             esc(sanitizarPartidas(r.partidas)),
    precio_total:         num(r.precio_total, '0'),
    fecha_envio:          dt(r.fecha_envio) !== 'NULL' ? dt(r.fecha_envio) : 'CURRENT_TIMESTAMP',
    estado:               esc(r.estado || 'pendiente'),
    firma_base64:         esc(r.firma_base64),
    firma_url:            'NULL',
    fecha_firma:          dt(r.fecha_firma),
    detalles_rechazo:     esc(r.detalles_rechazo),
});

const mapProveedor = r => ({
    id:               esc(r.id),
    nombre_empresa:   esc(r.nombre_empresa),
    oficio_principal: esc(r.oficio_principal),
    email:            esc(r.email),
    telefono:         esc(r.telefono),
    valoracion:       num(r.valoracion),
    created_at:       'CURRENT_TIMESTAMP',
});

const mapSolicitud = r => ({
    id:                    esc(r.id),
    propuesta_id:          esc(r.propuesta_id),
    oficio_solicitado:     esc(r.oficio_solicitado),
    fecha_envio:           dt(r.fecha_envio),
    estado_solicitud:      esc(r.estado_solicitud || 'Enviada'),
    token:                 esc(r.token),
    proveedor_nombre:      esc(r.proveedor_nombre),
    proveedor_email:       esc(r.proveedor_email),
    tareas:                esc(r.tareas),
    proveedor_id:          esc(r.proveedor_id),
    comentarios_generales: esc(r.comentarios_generales),
    anexo_url:             esc(r.anexo_url),
    created_at:            'CURRENT_TIMESTAMP',
});

const mapRespuesta = r => ({
    id:              esc(r.id),
    solicitud_id:    esc(r.solicitud_id),
    proveedor_id:    esc(r.proveedor_id),
    partida_id:      esc(r.partida_id),
    precio_ofertado: num(r.precio_ofertado),
    comentarios:     esc(r.comentarios),
    created_at:      dt(r.created_at) !== 'NULL' ? dt(r.created_at) : 'CURRENT_TIMESTAMP',
});

const mapHistorial = r => ({
    // id es AUTO_INCREMENT — no se inserta
    fecha_cambio:        dt(r.fecha_cambio) !== 'NULL' ? dt(r.fecha_cambio) : 'CURRENT_TIMESTAMP',
    usuario:             esc(r.usuario),
    origen_cambio:       esc(r.origen_cambio),
    tipo_entidad:        esc(r.tipo_entidad),
    entidad_id:          esc(r.entidad_id),
    proyecto_referencia: esc(r.proyecto_referencia),
    campo_modificado:    esc(r.campo_modificado),
    valor_anterior:      esc(r.valor_anterior),
    valor_nuevo:         esc(r.valor_nuevo),
    detalles:            esc(r.detalles),
    created_at:          'CURRENT_TIMESTAMP',
});

const mapBaseAdir = r => ({
    codigo:               esc(r.codigo),
    categoria:            esc(r.categoria),
    unidad:               esc(r.unidad),
    descripcion_corta:    esc(r.descripcion_corta),
    descripcion_detallada: esc(r.descripcion_detallada),
    mano_de_obra:         num(r.mano_de_obra),
    maquinaria:           num(r.maquinaria),
    materiales_y_otros:   num(r.materiales_y_otros),
    precio_total:         num(r.precio_total),
    tags:                 esc(r.tags),
    tipo:                 esc(r.tipo),
    fecha:                dateOnly(r.fecha),
    tipo_partida:         esc(r.tipo_partida),
    fuente:               esc(r.fuente),
    fecha_actualizacion:  dateOnly(r.fecha_actualizacion),
});

const mapCype = r => ({
    codigo:               esc(r.codigo),
    categoria:            esc(r.categoria),
    unidad:               esc(r.unidad),
    descripcion_corta:    esc(r.descripcion_corta),
    descripcion_detallada: esc(r.descripcion_detallada),
    mano_de_obra:         num(r.mano_de_obra),
    maquinaria:           num(r.maquinaria),
    materiales:           num(r.materiales),
    precio_total:         num(r.precio_total),
    tipo_partida:         esc(r.tipo_partida),
    fuente:               esc(r.fuente),
    fecha_actualizacion:  dateOnly(r.fecha_actualizacion),
});

const mapConfig = r => ({
    clave: esc(r.clave),
    valor: esc(r.valor),
});

// ─── MAIN ─────────────────────────────────────────────────────────────────────
async function main() {
    console.log('🚀 Exportando Supabase → MySQL (prefijo: ' + PREFIX + ')\n');

    // Tablas de transacciones (pequeñas/medianas — en paralelo)
    const [propuestas, presupuestos, proveedores, solicitudes, respuestas, configuracion] =
        await Promise.all([
            fetchAll('propuestas'),
            fetchAll('presupuestos_cliente'),
            fetchAll('proveedores'),
            fetchAll('solicitudes'),
            fetchAll('respuestas'),
            fetchAll('configuracion'),
        ]);

    // partidas e historial (potencialmente grandes — en serie para no saturar)
    const partidas  = await fetchAll('partidas');
    const historial = await fetchAll('historial_cambios');

    // Tablas de precios (grandes — en serie)
    console.log('\n📚 Exportando catálogos de precios (puede tardar ~30s)...');
    const baseAdir = await fetchAll('base_precios_adir');
    const cype     = await fetchAll('PreciosCype');

    // Totales
    const total = [propuestas, partidas, presupuestos, proveedores, solicitudes,
                   respuestas, historial, baseAdir, cype, configuracion]
                  .reduce((s, t) => s + t.length, 0);

    console.log(`\n📊 Total: ${total.toLocaleString()} filas`);
    console.log(`   propuestas:          ${propuestas.length}`);
    console.log(`   partidas:            ${partidas.length}`);
    console.log(`   presupuestos:        ${presupuestos.length}`);
    console.log(`   proveedores:         ${proveedores.length}`);
    console.log(`   solicitudes:         ${solicitudes.length}`);
    console.log(`   respuestas:          ${respuestas.length}`);
    console.log(`   historial_cambios:   ${historial.length}`);
    console.log(`   base_precios_adir:   ${baseAdir.length}`);
    console.log(`   precios_cype:        ${cype.length}`);

    const fecha   = new Date().toISOString().split('T')[0];
    const outFile = `migracion_adir_datos_${fecha}.sql`;

    console.log('\n✍  Generando fichero SQL...');

    const cabecera = [
        `-- ${'='.repeat(60)}`,
        `--  ADIR — Migración completa Supabase → MySQL`,
        `--  Prefijo: ${PREFIX}   BD: adirg_bbdd (Dinahosting)`,
        `--  Generado: ${new Date().toISOString()}`,
        `--  Total filas: ${total.toLocaleString()}`,
        `-- ${'='.repeat(60)}`,
        `--`,
        `--  ORDEN DE IMPORTACIÓN:`,
        `--    1. mysql_schema_dinahosting.sql  (estructura, primero)`,
        `--    2. Este fichero (datos)`,
        `--  phpMyAdmin → adirg_bbdd → Importar → utf-8 → SQL`,
        `-- ${'='.repeat(60)}`,
        ``,
        `SET NAMES utf8mb4;`,
        `SET FOREIGN_KEY_CHECKS = 0;`,
        ``,
    ].join('\n');

    const pie = [
        ``,
        `SET FOREIGN_KEY_CHECKS = 1;`,
        ``,
        `-- ${'='.repeat(60)}`,
        `--  FIN DE LA MIGRACIÓN`,
        `-- ${'='.repeat(60)}`,
    ].join('\n');

    // Escribir en partes para evitar string gigante en memoria
    const ws = fs.createWriteStream(outFile, { encoding: 'utf8' });
    ws.write(cabecera);

    // Orden: sin FK primero, luego dependientes
    const bloques = [
        genInserts(`${PREFIX}propuestas`,           propuestas,   mapPropuesta),
        genInserts(`${PREFIX}proveedores`,          proveedores,  mapProveedor),
        genInserts(`${PREFIX}partidas`,             partidas,     mapPartida),
        genInserts(`${PREFIX}presupuestos_cliente`, presupuestos, mapPresupuesto),
        genInserts(`${PREFIX}solicitudes`,          solicitudes,  mapSolicitud),
        genInserts(`${PREFIX}respuestas`,           respuestas,   mapRespuesta),
        genInserts(`${PREFIX}historial_cambios`,    historial,    mapHistorial),
        genInserts(`${PREFIX}base_precios_adir`,    baseAdir,     mapBaseAdir),
        genInserts(`${PREFIX}precios_cype`,         cype,         mapCype),
        genInserts(`${PREFIX}configuracion`,        configuracion,mapConfig),
    ];

    for (const bloque of bloques) ws.write(bloque);
    ws.write(pie);
    ws.end();

    await new Promise(r => ws.on('finish', r));

    const stats  = fs.statSync(outFile);
    const sizeKB = Math.round(stats.size / 1024);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(1);

    console.log(`\n✅ Fichero: ${outFile}  (${sizeKB} KB / ${sizeMB} MB)`);

    if (stats.size > 90 * 1024 * 1024) {
        console.log(`\n⚠ Fichero > 90 MB. Puede superar el límite de phpMyAdmin (100 MB).`);
        console.log(`  Solución: importa las tablas de precios por separado.`);
    }

    console.log(`\n📌 Pasos en phpMyAdmin:`);
    console.log(`   https://phpadmin.gestiondecuenta.com/52/index.php?route=/database/structure&db=adirg_bbdd`);
    console.log(`   1. Importar → mysql_schema_dinahosting.sql  (charset: utf-8)`);
    console.log(`   2. Importar → ${outFile}  (charset: utf-8)`);
}

main().catch(err => { console.error('\n❌', err.message); process.exit(1); });
