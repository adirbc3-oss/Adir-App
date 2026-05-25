/**
 * Cliente Dinahosting — reemplaza supabaseClient.js
 * ==================================================
 * Imita la interfaz de @supabase/supabase-js para que el código
 * React no necesite cambios masivos.
 *
 * USO: renombrar este fichero a supabaseClient.js y ajustar las
 * variables de entorno en Vercel:
 *   VITE_API_URL    = https://TU_DOMINIO.dinahosting.com/api/api.php
 *   VITE_API_KEY    = la clave que pusiste en api.php
 */

const API_URL = import.meta.env.VITE_API_URL;
const API_KEY  = import.meta.env.VITE_API_KEY;

if (!API_URL || !API_KEY) {
    console.error('[dinahostingClient] Faltan VITE_API_URL o VITE_API_KEY en .env');
}

// ─── Conversión de filtros Supabase → query string ────────────────────────────
function buildQS(filters = {}, opts = {}) {
    const params = new URLSearchParams();
    for (const [col, val] of Object.entries(filters)) {
        params.set(col, val);
    }
    if (opts.select) params.set('select', opts.select);
    if (opts.limit)  params.set('limit',  opts.limit);
    if (opts.offset) params.set('offset', opts.offset);
    if (opts.order)  params.set('order',  opts.order);
    return params.toString() ? '?' + params.toString() : '';
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────
async function apiFetch(table, method, qs = '', body = null) {
    const url = `${API_URL}/${table}${qs}`;
    const opts = {
        method,
        headers: {
            'Content-Type': 'application/json',
            'X-Api-Key': API_KEY,
        },
    };
    if (body !== null) opts.body = JSON.stringify(body);

    try {
        const res = await fetch(url, opts);
        const data = await res.json();
        if (!res.ok) return { data: null, error: data };
        return { data, error: null };
    } catch (err) {
        return { data: null, error: { message: err.message } };
    }
}

// ─── Query Builder (imita supabase-js) ───────────────────────────────────────
class QueryBuilder {
    constructor(table) {
        this._table   = table;
        this._filters = {};
        this._select  = '*';
        this._method  = 'GET';
        this._body    = null;
        this._order   = null;
        this._limit   = null;
        this._offset  = null;
        this._count   = null;
    }

    select(cols = '*') { this._select = cols; return this; }
    order(col, { ascending = true } = {}) {
        this._order = `${col}.${ascending ? 'asc' : 'desc'}`;
        return this;
    }
    limit(n) { this._limit = n; return this; }
    offset(n) { this._offset = n; return this; }

    // Filtros
    eq(col, val)  { this._filters[col] = `eq.${val}`;  return this; }
    neq(col, val) { this._filters[col] = `neq.${val}`; return this; }
    gt(col, val)  { this._filters[col] = `gt.${val}`;  return this; }
    gte(col, val) { this._filters[col] = `gte.${val}`; return this; }
    lt(col, val)  { this._filters[col] = `lt.${val}`;  return this; }
    lte(col, val) { this._filters[col] = `lte.${val}`; return this; }
    in(col, vals) { this._filters[col] = `in.(${vals.join(',')})`; return this; }
    like(col, val){ this._filters[col] = `like.${val}`; return this; }

    // Modificadores de respuesta (no implementados, compatibilidad)
    maybeSingle() { this._single = true; return this; }
    single()      { this._single = true; return this; }

    // Acciones de escritura
    insert(data)         { this._method = 'POST';   this._body = data; return this; }
    update(data)         { this._method = 'PATCH';  this._body = data; return this; }
    delete({ count } = {}) {
        this._method = 'DELETE';
        if (count) this._count = count;
        return this;
    }
    upsert(data)         { this._method = 'POST';   this._body = data; return this; } // simplificado

    // Suscripciones tiempo real (no soportado en MySQL — stub para compatibilidad)
    channel() { return { on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }) }; }
    removeChannel() {}

    // Ejecutar la query
    async _execute() {
        const opts = {
            select: this._select !== '*' ? this._select : undefined,
            order:  this._order,
            limit:  this._limit,
            offset: this._offset,
        };
        const qs = buildQS(this._filters, opts);
        const result = await apiFetch(this._table, this._method, qs, this._body);

        // Emular count de Supabase
        if (this._count && result.data) {
            result.count = result.data.deleted ?? result.data.updated ?? null;
        }

        // Emular maybeSingle / single
        if (this._single && Array.isArray(result.data)) {
            result.data = result.data[0] ?? null;
        }

        return result;
    }

    // Permite await directamente o .then()
    then(resolve, reject) {
        return this._execute().then(resolve, reject);
    }
}

// ─── Cliente público ──────────────────────────────────────────────────────────
export const supabase = {
    from: (table) => new QueryBuilder(table),

    // Real-time (stub — sin soporte en MySQL)
    channel: (name) => ({
        on: () => ({ subscribe: () => {} }),
    }),
    removeChannel: () => {},

    // Auth (stub — sin soporte; la app no usa auth de Supabase)
    auth: {
        getUser: async () => ({ data: { user: null }, error: null }),
        signIn: async () => ({ data: null, error: { message: 'Auth no implementado' } }),
    },

    // Storage (stub — para firmas habría que implementar upload a FTP)
    storage: {
        from: () => ({
            upload: async () => ({ error: { message: 'Storage no implementado' } }),
            getPublicUrl: () => ({ data: { publicUrl: '' } }),
        }),
    },
};
