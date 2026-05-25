/**
 * Cliente MySQL/Dinahosting — reemplaza @supabase/supabase-js
 * ===========================================================
 * Imita la interfaz de supabase-js para que las páginas React
 * no necesiten ningún cambio de código.
 *
 * Instalación:
 *   1. Copiar el contenido de este fichero en src/utils/supabaseClient.js
 *   2. Añadir en Vercel (o .env.local):
 *        VITE_API_URL = https://TU_DOMINIO/api/api.php
 *        VITE_API_KEY = (misma clave que API_KEY en api.php)
 */

const API_URL = import.meta.env.VITE_API_URL;
const API_KEY  = import.meta.env.VITE_API_KEY;

if (!API_URL || !API_KEY) {
    console.error('[dinahostingClient] Faltan VITE_API_URL o VITE_API_KEY en .env');
}

// ─── Fetch helper ─────────────────────────────────────────────────────────────
async function apiFetch(table, method, params = {}, body = null) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        if (v !== undefined && v !== null) qs.set(k, String(v));
    }
    const url = `${API_URL}/${table}${qs.toString() ? '?' + qs.toString() : ''}`;
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
        const data = await res.json().catch(() => null);
        if (!res.ok) return { data: null, error: data ?? { message: `HTTP ${res.status}` } };
        return { data, error: null };
    } catch (err) {
        return { data: null, error: { message: err.message } };
    }
}

// ─── Query Builder ────────────────────────────────────────────────────────────
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
        this._single  = false;
        this._head    = false;   // para count=exact, head:true
        this._count   = null;    // 'exact' | null
    }

    // ── Selección y opciones ──────────────────────────────────────────────────
    select(cols = '*', opts = {}) {
        this._select = cols;
        if (opts.count) this._count = opts.count;
        if (opts.head)  this._head  = opts.head;
        return this;
    }

    order(col, { ascending = true } = {}) {
        this._order = `${col}.${ascending ? 'asc' : 'desc'}`;
        return this;
    }
    limit(n)  { this._limit  = n; return this; }
    offset(n) { this._offset = n; return this; }
    range(from, to) {
        this._offset = from;
        this._limit  = to - from + 1;
        return this;
    }

    // ── Filtros ───────────────────────────────────────────────────────────────
    eq(col, val)   { this._filters[col] = `eq.${val}`;   return this; }
    neq(col, val)  { this._filters[col] = `neq.${val}`;  return this; }
    gt(col, val)   { this._filters[col] = `gt.${val}`;   return this; }
    gte(col, val)  { this._filters[col] = `gte.${val}`;  return this; }
    lt(col, val)   { this._filters[col] = `lt.${val}`;   return this; }
    lte(col, val)  { this._filters[col] = `lte.${val}`;  return this; }
    like(col, val) { this._filters[col] = `like.${val}`; return this; }
    in(col, vals)  {
        this._filters[col] = `in.(${vals.join(',')})`;
        return this;
    }
    contains(col, val) { this._filters[col] = `cs.${val}`; return this; }

    // ── Single row ────────────────────────────────────────────────────────────
    maybeSingle() { this._single = true; return this; }
    single()      { this._single = true; return this; }

    // ── Escritura ─────────────────────────────────────────────────────────────
    insert(data)             { this._method = 'POST';   this._body = data; return this; }
    update(data)             { this._method = 'PATCH';  this._body = data; return this; }
    upsert(data, _opts = {}) { this._method = 'POST';   this._body = data; return this; }
    delete(_opts = {}) {
        this._method = 'DELETE';
        return this;
    }

    // ── Real-time (stubs) ─────────────────────────────────────────────────────
    channel()       { return { on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }) }; }
    removeChannel() {}

    // ── Ejecución ─────────────────────────────────────────────────────────────
    async _execute() {
        const params = { ...this._filters };
        if (this._select !== '*') params.select = this._select;
        if (this._order)          params.order  = this._order;
        if (this._limit !== null) params.limit  = this._limit;
        if (this._offset !== null) params.offset = this._offset;

        // Si es count=exact con head:true → devolver count simulado
        if (this._count === 'exact' && this._head) {
            // Hacer fetch con limit=1 y leer el total del array
            const r = await apiFetch(this._table, 'GET', { ...params, limit: 1 }, null);
            const arr = Array.isArray(r.data) ? r.data : [];
            // La API no devuelve total exacto; hacemos una segunda llamada sin límite
            // para obtener el count real (solo para propuestas que son pocas filas)
            const rAll = await apiFetch(this._table, 'GET', { ...this._filters }, null);
            const count = Array.isArray(rAll.data) ? rAll.data.length : 0;
            return { data: arr, count, error: r.error };
        }

        const result = await apiFetch(this._table, this._method, params, this._body);

        // Emular maybeSingle / single
        if (this._single && Array.isArray(result.data)) {
            result.data = result.data[0] ?? null;
        }

        return result;
    }

    then(resolve, reject) {
        return this._execute().then(resolve, reject);
    }
}

// ─── Cliente público (misma interfaz que supabase-js) ────────────────────────
export const supabase = {
    from: (table) => new QueryBuilder(table),

    // Real-time (stubs — MySQL no lo soporta)
    channel: (name) => ({
        on: (_event, _filter, _cb) => ({
            subscribe: (_cb2) => ({ unsubscribe: () => {} }),
        }),
    }),
    removeChannel: () => {},

    // Auth (stub — la app no usa auth de Supabase)
    auth: {
        getUser:  async () => ({ data: { user: null }, error: null }),
        signIn:   async () => ({ data: null, error: { message: 'Auth no implementado' } }),
        signOut:  async () => ({ error: null }),
    },

    // Storage (stub — para firmas/anexos usar FTP Dinahosting)
    storage: {
        from: () => ({
            upload: async () => ({ data: null, error: { message: 'Storage: usar FTP Dinahosting' } }),
            getPublicUrl: () => ({ data: { publicUrl: '' } }),
        }),
    },
};
