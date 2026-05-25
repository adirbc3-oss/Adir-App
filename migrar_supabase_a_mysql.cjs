/**
 * MIGRACIÓN: Supabase → MySQL (Dinahosting)
 * ==========================================
 * Lee todos los datos de Supabase vía REST API y genera un fichero SQL
 * listo para importar en phpMyAdmin de Dinahosting.
 *
 * USO:
 *   1. Abre el panel de Dinahosting y anota: host, usuario, contraseña, BD (adirg_bbdd)
 *   2. (Opcional) Instala mysql2: npm install mysql2
 *   3. Ejecuta: node migrar_supabase_a_mysql.cjs
 *   4. Se generará "migracion_adir_YYYY-MM-DD.sql" — impórtalo en phpMyAdmin
 *
 * ALTERNATIVA DIRECTA (sin fichero):
 *   Descomenta la sección MYSQL_DIRECT al final del script.
 */

const SUPABASE_URL = 'https://mspejiongrdsgbqomewj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_-_DqtXu-GQ97LecbJgLgqw_ADU_ZMzG';
const fs = require('fs');

const headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function fetchAll(table, select = '*', extraParams = '') {
    const rows = [];
    let offset = 0;
    const limit = 1000;
    while (true) {
        const url = `${SUPABASE_URL}/rest/v1/${table}?select=${select}&limit=${limit}&offset=${offset}${extraParams}`;
        const res = await fetch(url, { headers });
        if (!res.ok) {
            const txt = await res.text();
            console.error(`Error en ${table}:`, txt);
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

function escape(v) {
    if (v === null || v === undefined) return 'NULL';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'boolean') return v ? '1' : '0';
    if (typeof v === 'object') v = JSON.stringify(v);
    // Escapar para MySQL
    return "'" + String(v)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\0/g, '\\0')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r')
        .replace(/\x1a/g, '\\Z') + "'";
}

function toDateTime(v) {
    if (!v) return 'NULL';
    // Normalizar timestamp de Supabase a MySQL DATETIME
    const d = new Date(v);
    if (isNaN(d.getTime())) return 'NULL';
    return `'${d.toISOString().slice(0, 19).replace('T', ' ')}'`;
}

function genInserts(table, rows, mapFn) {
    if (!rows.length) return `-- (sin datos en ${table})\n`;
    const lines = [];
    lines.push(`-- ${table} (${rows.length} filas)`);
    lines.push(`TRUNCATE TABLE \`${table}\`;`);
    for (const row of rows) {
        try {
            const mapped = mapFn(row);
            if (!mapped) continue;
            const cols = Object.keys(mapped).map(c => `\`${c}\``).join(', ');
            const vals = Object.values(mapped).join(', ');
            lines.push(`INSERT INTO \`${table}\` (${cols}) VALUES (${vals});`);
        } catch (e) {
            console.warn(`  ⚠ Error en fila de ${table}:`, e.message, row);
        }
    }
    lines.push('');
    return lines.join('\n');
}

// ─── Mapeos: Supabase → MySQL ──────────────────────────────────────────────────

function mapPropuesta(r) {
    return {
        Proyecto:         escape(r.Proyecto),
        cliente:          escape(r.cliente),
        direccion:        escape(r.direccion),
        jefe_obra:        escape(r.jefe_obra),
        estado:           escape(r.estado || 'Borrador'),
        fecha_recepcion:  toDateTime(r.fecha_recepcion),
        descripcion:      escape(r.descripcion),
    };
}

function mapPartida(r) {
    // Separar texto_partida "COD::Descripción" → capitulo_codigo + descripcion
    let capitulo_codigo = null;
    let descripcion = null;
    if (r.texto_partida) {
        if (r.texto_partida.includes('::')) {
            const parts = r.texto_partida.split('::');
            capitulo_codigo = parts[0].trim();
            descripcion = parts.slice(1).join('::').replace(/\|/g, ' ').trim();
        } else {
            descripcion = r.texto_partida;
        }
    }
    return {
        id:                      escape(r.id),
        propuesta_id:            escape(r.propuesta_id),
        capitulo_codigo:         escape(capitulo_codigo),
        descripcion:             escape(descripcion),
        precio_base_estimado:    parseFloat(r.precio_base_estimado) || 0,
        precio_adjudicado:       r.precio_adjudicado != null ? parseFloat(r.precio_adjudicado) : 'NULL',
        cantidad:                parseFloat(r.cantidad) || 0,
        unidad:                  escape(r.unidad),
        oficio_asignado:         escape(r.oficio_asignado),
        proveedor_adjudicado_id: escape(r.proveedor_adjudicado_id),
        estado_adjudicacion:     escape(r.estado_adjudicacion),
        created_at:              toDateTime(r.created_at),
    };
}

function sanitizarPartidasJSON(partidas) {
    if (!Array.isArray(partidas)) return partidas;
    return partidas.map(p => ({
        Capítulo:              p.Capítulo || p['Capítulo'] || '',
        Descripción:           p.Descripción || p['Descripción'] || '',
        Cantidad:              parseFloat(p.Cantidad) || 0,
        'Unidad IA':           p['Unidad IA'] || p.unidad || '',
        precio_adjudicado:     parseFloat(p.precio_adjudicado || p['Precio Total (€)']) || 0,
        precio_total_capitulo: parseFloat(p.precio_total_capitulo) || 0,
    }));
}

function mapPresupuesto(r) {
    const partidasClean = sanitizarPartidasJSON(r.partidas);
    return {
        id:                    escape(r.id),
        token:                 escape(r.token),
        propuesta_id:          escape(r.propuesta_id),
        cliente_nombre:        escape(r.cliente_nombre),
        cliente_email:         escape(r.cliente_email),
        proyecto_descripcion:  escape(r.proyecto_descripcion),
        partidas:              escape(partidasClean),
        precio_total:          parseFloat(r.precio_total) || 0,
        fecha_envio:           toDateTime(r.fecha_envio),
        estado:                escape(r.estado || 'pendiente'),
        firma_url:             'NULL',  // base64 → fichero (ver nota abajo)
        firma_base64:          escape(r.firma_base64),  // migrar temporalmente
        fecha_firma:           toDateTime(r.fecha_firma),
        detalles_rechazo:      escape(r.detalles_rechazo),
    };
}

function mapProveedor(r) {
    return {
        id:               escape(r.id),
        nombre_empresa:   escape(r.nombre_empresa),
        oficio_principal: escape(r.oficio_principal),
        email:            escape(r.email),
        telefono:         escape(r.telefono),
        created_at:       toDateTime(r.created_at),
    };
}

function mapSolicitud(r) {
    return {
        id:               escape(r.id),
        propuesta_id:     escape(r.propuesta_id),
        proveedor_id:     escape(r.proveedor_id),
        proveedor_nombre: escape(r.proveedor_nombre),
        proveedor_email:  escape(r.proveedor_email),
        estado_solicitud: escape(r.estado_solicitud || 'Enviada'),
        created_at:       toDateTime(r.created_at),
    };
}

function mapRespuesta(r) {
    return {
        id:              escape(r.id),
        solicitud_id:    escape(r.solicitud_id),
        partida_id:      escape(r.partida_id),
        precio_ofertado: r.precio_ofertado != null ? parseFloat(r.precio_ofertado) : 'NULL',
        comentarios:     escape(r.comentarios),
        created_at:      toDateTime(r.created_at),
    };
}

function mapHistorial(r) {
    return {
        id:                   parseInt(r.id) || 'NULL',
        origen_cambio:        escape(r.origen_cambio),
        tipo_entidad:         escape(r.tipo_entidad),
        entidad_id:           escape(r.entidad_id),
        proyecto_referencia:  escape(r.proyecto_referencia),
        campo_modificado:     escape(r.campo_modificado),
        valor_anterior:       escape(r.valor_anterior),
        valor_nuevo:          escape(r.valor_nuevo),
        detalles:             escape(r.detalles),
        created_at:           toDateTime(r.created_at),
    };
}

function mapBasePrecios(r) {
    return {
        id:                escape(r.id),
        codigo:            escape(r.codigo),
        descripcion_corta: escape(r.descripcion_corta),
        descripcion_larga: escape(r.descripcion_larga || r.descripcion),
        tags:              escape(r.tags),
        unidad:            escape(r.unidad),
        tipo_partida:      escape(r.tipo_partida),
        precio_total:      r.precio_total != null ? parseFloat(r.precio_total) : 'NULL',
        mano_de_obra:      r.mano_de_obra != null ? parseFloat(r.mano_de_obra) : 'NULL',
        ratio_mo:          r.ratio_mo != null ? parseFloat(r.ratio_mo) : 'NULL',
        origen:            escape(r.origen),
        created_at:        toDateTime(r.created_at),
    };
}

function mapConfiguracion(r) {
    return {
        clave:  escape(r.clave),
        valor:  escape(r.valor),
    };
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
    console.log('🚀 Iniciando migración Supabase → MySQL\n');

    const fecha = new Date().toISOString().split('T')[0];
    const outFile = `migracion_adir_${fecha}.sql`;

    // Leer todas las tablas
    const [
        propuestas,
        partidas,
        presupuestos,
        proveedores,
        solicitudes,
        respuestas,
        historial,
        basePrecios,
        configuracion,
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

    // Estadísticas
    console.log('\n📊 Resumen:');
    console.log(`  propuestas:          ${propuestas.length}`);
    console.log(`  partidas:            ${partidas.length}`);
    console.log(`  presupuestos:        ${presupuestos.length}`);
    console.log(`  proveedores:         ${proveedores.length}`);
    console.log(`  solicitudes:         ${solicitudes.length}`);
    console.log(`  respuestas:          ${respuestas.length}`);
    console.log(`  historial_cambios:   ${historial.length}`);
    console.log(`  base_precios:        ${basePrecios.length}`);

    // Generar SQL
    const sql = [
        `-- ============================================================`,
        `--  MIGRACIÓN ADIR: Supabase → MySQL/MariaDB`,
        `--  Generado: ${new Date().toISOString()}`,
        `--  BD destino: adirg_bbdd (Dinahosting)`,
        `-- ============================================================`,
        ``,
        `SET NAMES utf8mb4;`,
        `SET FOREIGN_KEY_CHECKS = 0;`,
        ``,
        genInserts('propuestas',          propuestas,   mapPropuesta),
        genInserts('proveedores',         proveedores,  mapProveedor),
        genInserts('partidas',            partidas,     mapPartida),
        genInserts('presupuestos_cliente',presupuestos, mapPresupuesto),
        genInserts('solicitudes',         solicitudes,  mapSolicitud),
        genInserts('respuestas',          respuestas,   mapRespuesta),
        genInserts('historial_cambios',   historial,    mapHistorial),
        genInserts('base_precios',        basePrecios,  mapBasePrecios),
        genInserts('configuracion',       configuracion,mapConfiguracion),
        ``,
        `SET FOREIGN_KEY_CHECKS = 1;`,
        ``,
        `-- ============================================================`,
        `--  NOTAS POST-MIGRACIÓN:`,
        `--`,
        `--  1. firma_base64: los registros se han migrado a firma_base64`,
        `--     Para moverlos a ficheros: extraer base64, subir a FTP de`,
        `--     Dinahosting como /firmas/{token}.png, actualizar firma_url`,
        `--     y vaciar firma_base64 para ahorrar espacio.`,
        `--`,
        `--  2. partidas.capitulo_codigo: ya separado de texto_partida.`,
        `--     Si el frontend sigue usando texto_partida, añade una`,
        `--     columna virtual o actualiza el código React.`,
        `-- ============================================================`,
    ].join('\n');

    fs.writeFileSync(outFile, sql, 'utf8');

    const sizeKB = Math.round(Buffer.byteLength(sql, 'utf8') / 1024);
    console.log(`\n✅ Fichero generado: ${outFile} (${sizeKB} KB)`);
    console.log('\n📌 Próximos pasos:');
    console.log('  1. Importa mysql_schema_dinahosting.sql en phpMyAdmin primero');
    console.log('  2. Luego importa este fichero de datos');
    console.log('  3. Si el fichero es >64 MB, divide por tablas manualmente');
    console.log('\n🔗 phpMyAdmin: https://phpadmin.gestiondecuenta.com/52/index.php?route=/database/structure&db=adirg_bbdd');
}

main().catch(console.error);

// ─────────────────────────────────────────────────────────────────────────────
// CONEXIÓN DIRECTA A MYSQL (alternativa al fichero SQL)
// Descomenta si tienes los datos de acceso de Dinahosting
// ─────────────────────────────────────────────────────────────────────────────
/*
const mysql = require('mysql2/promise');

const MYSQL_CONFIG = {
    host:     'TU_HOST_DINAHOSTING',    // ej: db123.dinahosting.com
    user:     'TU_USUARIO',
    password: 'TU_PASSWORD',
    database: 'adirg_bbdd',
    charset:  'utf8mb4',
    ssl:      { rejectUnauthorized: false }
};
*/
