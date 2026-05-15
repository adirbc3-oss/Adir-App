import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useModal, useToast } from '../utils/useModal';
import { Search, Save, FileUp, Loader2, Database, TableProperties, X, CheckCircle, AlertCircle, Upload, Info } from 'lucide-react';
import { bc3ToBasePrecios } from '../utils/bc3ToBasePrecios';

const PAGE_SIZE = 50;
const UPSERT_BATCH = 200; // filas por lote de upsert

// ── Utilidad: leer archivo como texto (latin1 para BC3) ──────────────────────
function readFileAsLatin1(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsText(file, 'windows-1252');
  });
}

// ── Modal de subida BC3 ───────────────────────────────────────────────────────
function ModalBC3({ onClose, onImportDone, showToast }) {
  const [dragging, setDragging] = useState(false);
  const [parsing,  setParsing]  = useState(false);
  const [preview,  setPreview]  = useState(null); // { filas, stats }
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importDone, setImportDone] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const handleFile = useCallback(async (file) => {
    if (!file || !file.name.toLowerCase().endsWith('.bc3')) {
      setError('El archivo debe tener extensión .bc3');
      return;
    }
    setError('');
    setParsing(true);
    setPreview(null);
    try {
      const text = await readFileAsLatin1(file);
      const filas = bc3ToBasePrecios(text);

      if (filas.length === 0) {
        setError('No se encontraron partidas válidas en el archivo BC3.');
        return;
      }

      // Estadísticas de preview
      const estimados  = filas.filter(f => f.desglose_estimado).length;
      const conDatos   = filas.length - estimados;
      const cats = [...new Set(filas.map(f => f.categoria))];

      setPreview({ filas, stats: { total: filas.length, conDatos, estimados, cats } });
    } catch (e) {
      console.error(e);
      setError('Error al procesar el archivo: ' + e.message);
    } finally {
      setParsing(false);
    }
  }, []);

  // Drag & drop
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const handleImport = async () => {
    if (!preview) return;
    setImporting(true);
    setImportProgress(0);
    const { filas } = preview;
    const total = filas.length;
    let done = 0;
    let errores = 0;

    // Upsert en lotes
    for (let i = 0; i < total; i += UPSERT_BATCH) {
      const lote = filas.slice(i, i + UPSERT_BATCH).map(({ desglose_estimado, ...rest }) => rest);
      try {
        const { error } = await supabase
          .from('base_precios_adir')
          .upsert(lote, { onConflict: 'codigo', ignoreDuplicates: false });
        if (error) {
          console.error('Upsert error:', error);
          errores += lote.length;
        }
      } catch (e) {
        errores += lote.length;
      }
      done += lote.length;
      setImportProgress(Math.round((done / total) * 100));
    }

    setImporting(false);
    setImportDone(true);
    if (errores === 0) {
      showToast(`${total} partidas importadas/actualizadas correctamente.`);
    } else {
      showToast(`Importación con ${errores} errores de ${total} partidas.`, 'error');
    }
    onImportDone();
  };

  // ── UI del modal ────────────────────────────────────────────────────────────
  const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '20px'
  };
  const boxStyle = {
    background: 'var(--bg-primary)', borderRadius: '16px',
    padding: '32px', maxWidth: '720px', width: '100%',
    maxHeight: '90vh', overflowY: 'auto',
    boxShadow: '0 20px 60px rgba(0,0,0,0.4)'
  };

  return (
    <div style={overlayStyle} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={boxStyle}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.4rem' }}>Importar BC3 a Base de Precios</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              Añade o actualiza partidas en la base ADIR desde un archivo .bc3
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}>
            <X size={22} />
          </button>
        </div>

        {/* Drop zone (sólo si no hay preview) */}
        {!preview && !parsing && (
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? 'var(--primary)' : 'var(--border-color)'}`,
              borderRadius: '12px', padding: '48px 24px', textAlign: 'center',
              cursor: 'pointer', transition: 'all 0.2s',
              background: dragging ? 'var(--primary-light)' : 'transparent'
            }}
          >
            <Upload size={40} style={{ color: dragging ? 'var(--primary)' : 'var(--text-muted)', marginBottom: '12px' }} />
            <p style={{ margin: 0, fontWeight: 600, fontSize: '1.1rem' }}>Arrastra tu archivo .BC3 aquí</p>
            <p style={{ margin: '8px 0 0', color: 'var(--text-muted)', fontSize: '0.9rem' }}>o haz clic para seleccionarlo</p>
            <input ref={inputRef} type="file" accept=".bc3" style={{ display: 'none' }}
              onChange={e => handleFile(e.target.files[0])} />
          </div>
        )}

        {/* Parsing spinner */}
        {parsing && (
          <div style={{ textAlign: 'center', padding: '48px 0' }}>
            <Loader2 size={36} className="loader-spinner" style={{ display: 'inline-block', marginBottom: '12px' }} />
            <p style={{ color: 'var(--text-muted)' }}>Analizando archivo BC3…</p>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '14px 16px',
            background: 'rgba(239,68,68,0.1)', borderRadius: '10px', color: '#ef4444', marginTop: '16px' }}>
            <AlertCircle size={18} /> {error}
          </div>
        )}

        {/* Preview */}
        {preview && !importDone && (
          <>
            {/* Stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '20px' }}>
              <StatCard label="Partidas encontradas" value={preview.stats.total} color="var(--primary)" />
              <StatCard label="Con desglose real" value={preview.stats.conDatos} color="#22c55e"
                sub="desde descomposición BC3" />
              <StatCard label="Desglose estimado" value={preview.stats.estimados} color="#f59e0b"
                sub="por tipo de trabajo" />
            </div>

            {/* Aviso estimación */}
            {preview.stats.estimados > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '12px 16px',
                background: 'rgba(245,158,11,0.08)', borderRadius: '10px', marginBottom: '16px',
                border: '1px solid rgba(245,158,11,0.3)' }}>
                <Info size={16} style={{ color: '#f59e0b', marginTop: '2px', flexShrink: 0 }} />
                <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  <strong>{preview.stats.estimados} partidas</strong> no tienen descomposición MO/Mat/Maq en el BC3.
                  Se ha estimado el desglose según el tipo de trabajo (albañilería, electricidad, fontanería…).
                  Puedes ajustarlo después editando cada partida.
                </p>
              </div>
            )}

            {/* Categorías detectadas */}
            <div style={{ marginBottom: '16px' }}>
              <p style={{ margin: '0 0 8px', fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                Categorías detectadas ({preview.stats.cats.length}):
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                {preview.stats.cats.slice(0, 20).map((c, i) => (
                  <span key={i} style={{ background: 'var(--primary-light)', color: 'var(--primary)',
                    padding: '2px 10px', borderRadius: '20px', fontSize: '0.78rem', fontWeight: 500 }}>
                    {c}
                  </span>
                ))}
                {preview.stats.cats.length > 20 && (
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.78rem', padding: '2px 6px' }}>
                    +{preview.stats.cats.length - 20} más
                  </span>
                )}
              </div>
            </div>

            {/* Tabla preview (primeras 15 filas) */}
            <div style={{ overflowX: 'auto', marginBottom: '20px', borderRadius: '8px',
              border: '1px solid var(--border-color)' }}>
              <table style={{ width: '100%', fontSize: '0.8rem', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--bg-secondary)' }}>
                    <th style={th}>Código</th>
                    <th style={th}>Categoría</th>
                    <th style={th}>Descripción</th>
                    <th style={th}>Ud.</th>
                    <th style={th}>M.O.</th>
                    <th style={th}>Mat.</th>
                    <th style={th}>Maq.</th>
                    <th style={th}>Total</th>
                    <th style={th}>Orig.</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.filas.slice(0, 15).map((f, i) => (
                    <tr key={i} style={{ borderTop: '1px solid var(--border-color)' }}>
                      <td style={td}><code style={{ fontSize: '0.75rem' }}>{f.codigo}</code></td>
                      <td style={{ ...td, maxWidth: '120px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={f.categoria}>{f.categoria}</td>
                      <td style={{ ...td, maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                        title={f.descripcion_corta}>{f.descripcion_corta}</td>
                      <td style={td}>{f.unidad}</td>
                      <td style={td}>{f.mano_de_obra?.toFixed(2)}</td>
                      <td style={td}>{f.materiales_y_otros?.toFixed(2)}</td>
                      <td style={td}>{f.maquinaria?.toFixed(2)}</td>
                      <td style={{ ...td, fontWeight: 700, color: 'var(--primary)' }}>{f.precio_total?.toFixed(2)}</td>
                      <td style={{ ...td, textAlign: 'center' }}>
                        {f.desglose_estimado
                          ? <span title="Desglose estimado" style={{ color: '#f59e0b' }}>~</span>
                          : <span title="Datos reales del BC3" style={{ color: '#22c55e' }}>✓</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {preview.filas.length > 15 && (
                <div style={{ padding: '8px 12px', fontSize: '0.8rem', color: 'var(--text-muted)',
                  borderTop: '1px solid var(--border-color)', textAlign: 'center' }}>
                  Mostrando 15 de {preview.filas.length} partidas
                </div>
              )}
            </div>

            {/* Barra de progreso */}
            {importing && (
              <div style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px', fontSize: '0.85rem' }}>
                  <span>Importando…</span><span>{importProgress}%</span>
                </div>
                <div style={{ height: '8px', background: 'var(--bg-secondary)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${importProgress}%`, background: 'var(--primary)',
                    transition: 'width 0.3s', borderRadius: '4px' }} />
                </div>
              </div>
            )}

            {/* Acciones */}
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button className="btn btn-secondary" onClick={() => { setPreview(null); setError(''); }}
                disabled={importing}>
                Cambiar archivo
              </button>
              <button className="btn btn-primary" onClick={handleImport} disabled={importing}
                style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {importing ? <><Loader2 size={16} className="loader-spinner" /> Importando…</>
                  : <><FileUp size={16} /> Importar {preview.stats.total} partidas</>}
              </button>
            </div>
          </>
        )}

        {/* Éxito */}
        {importDone && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <CheckCircle size={48} style={{ color: '#22c55e', marginBottom: '12px' }} />
            <h3 style={{ margin: '0 0 8px' }}>¡Importación completada!</h3>
            <p style={{ color: 'var(--text-muted)', marginBottom: '20px' }}>
              {preview.stats.total} partidas añadidas/actualizadas en la base de precios ADIR.
            </p>
            <button className="btn btn-primary" onClick={onClose}>Cerrar</button>
          </div>
        )}
      </div>
    </div>
  );
}

const th = { padding: '8px 10px', textAlign: 'left', fontWeight: 600, whiteSpace: 'nowrap' };
const td = { padding: '6px 10px' };

function StatCard({ label, value, color, sub }) {
  return (
    <div style={{ background: 'var(--bg-secondary)', borderRadius: '10px', padding: '14px 16px',
      borderLeft: `4px solid ${color}` }}>
      <div style={{ fontSize: '1.8rem', fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginTop: '4px' }}>{label}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '2px' }}>{sub}</div>}
    </div>
  );
}

// ── Página principal ──────────────────────────────────────────────────────────

const BasePrecios = () => {
  const { showAlert, ModalUI } = useModal();
  const { showToast, ToastUI } = useToast();

  const [activeTab, setActiveTab] = useState('adir');
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [categoriasDisponibles, setCategoriasDisponibles] = useState([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [showBC3Modal, setShowBC3Modal] = useState(false);

  // Editing
  const [editingId, setEditingId] = useState(null);
  const [editValues, setEditValues] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchData(true); }, [activeTab, searchTerm, selectedCategory]);
  useEffect(() => { cargarCategorias(); setSelectedCategory(''); }, [activeTab]);

  const cargarCategorias = async () => {
    const table = activeTab === 'adir' ? 'base_precios_adir' : 'PreciosCype';
    try {
      if (activeTab === 'adir') {
        const { data } = await supabase.from(table).select('categoria').limit(3000);
        if (data) setCategoriasDisponibles([...new Set(data.map(d => d.categoria).filter(Boolean))].sort());
      } else {
        const { data } = await supabase.from(table).select('categoria').limit(2000);
        if (data) setCategoriasDisponibles([...new Set(data.map(d => d.categoria).filter(Boolean))].sort());
      }
    } catch (e) { console.error('Error cargando categorías:', e); }
  };

  const fetchData = async (reset = false) => {
    setLoading(true);
    const currentPage = reset ? 0 : page;
    if (reset) { setPage(0); setData([]); }

    const table = activeTab === 'adir' ? 'base_precios_adir' : 'PreciosCype';
    try {
      let query = supabase.from(table)
        .select('*')
        .not('codigo', 'ilike', '%#')
        .order('codigo', { ascending: true });

      if (searchTerm) {
        query = query.or(`codigo.ilike.%${searchTerm}%,descripcion_corta.ilike.%${searchTerm}%`);
      }
      if (selectedCategory) {
        query = query.ilike('categoria', `%${selectedCategory}%`);
      }

      const from = currentPage * PAGE_SIZE;
      const { data: resultData, error } = await query.range(from, from + PAGE_SIZE - 1);
      if (error) throw error;

      if (resultData) {
        reset ? setData(resultData) : setData(prev => [...prev, ...resultData]);
        setHasMore(resultData.length === PAGE_SIZE);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      showToast('Error al cargar los datos.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (page > 0) fetchData(); }, [page]);

  const handleEditClick = (item) => {
    setEditingId(item.id);
    setEditValues({
      precio_total: item.precio_total || 0,
      mano_de_obra: item.mano_de_obra || 0,
      materiales_y_otros: activeTab === 'adir' ? item.materiales_y_otros : item.materiales,
      maquinaria: item.maquinaria || 0
    });
  };

  const handleSaveEdit = async (id) => {
    setSaving(true);
    const table = activeTab === 'adir' ? 'base_precios_adir' : 'PreciosCype';
    const updatePayload = {
      precio_total: parseFloat(editValues.precio_total),
      mano_de_obra: parseFloat(editValues.mano_de_obra),
      maquinaria: parseFloat(editValues.maquinaria)
    };
    if (activeTab === 'adir') updatePayload.materiales_y_otros = parseFloat(editValues.materiales_y_otros);
    else updatePayload.materiales = parseFloat(editValues.materiales_y_otros);

    try {
      const itemOriginal = data.find(d => d.id === id);
      const { error } = await supabase.from(table).update(updatePayload).eq('id', id);
      if (error) throw error;
      await supabase.from('historial_cambios').insert({
        origen_cambio: 'Manual',
        tipo_entidad: activeTab === 'adir' ? 'Base ADIR' : 'Base CYPE',
        entidad_id: itemOriginal.codigo,
        campo_modificado: 'Precio Total',
        valor_anterior: String(itemOriginal.precio_total || 0),
        valor_nuevo: String(updatePayload.precio_total),
        detalles: itemOriginal.descripcion_corta
      });
      showToast('Precio actualizado correctamente.');
      setData(data.map(d => d.id === id ? { ...d, ...updatePayload } : d));
      setEditingId(null);
    } catch (error) {
      console.error('Error updating price:', error);
      showToast('Error al actualizar precio.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleImportDone = () => {
    fetchData(true);
    cargarCategorias();
  };

  return (
    <div className="animate-fade-in" style={{ paddingBottom: '40px' }}>
      {ModalUI}
      {ToastUI}
      {showBC3Modal && (
        <ModalBC3
          onClose={() => setShowBC3Modal(false)}
          onImportDone={handleImportDone}
          showToast={showToast}
        />
      )}

      <div className="glass-card" style={{ marginBottom: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '15px' }}>
          <div>
            <h1>Bases de Precios</h1>
            <p>Visualiza y modifica las bases de precios oficiales.</p>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            {activeTab === 'adir' && (
              <button className="btn btn-secondary" onClick={() => setShowBC3Modal(true)}>
                <FileUp size={16} /> Subir BC3
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="glass-card" style={{ marginBottom: '20px', padding: '0' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)' }}>
          {['adir', 'cype'].map(tab => (
            <button key={tab}
              style={{
                flex: 1, padding: '15px',
                background: activeTab === tab ? 'var(--primary-light)' : 'transparent',
                border: 'none', borderBottom: activeTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeTab === tab ? 'var(--primary)' : 'var(--text-muted)',
                fontWeight: 600, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
              }}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'adir' ? <><Database size={18} /> Base Oficial ADIR</> : <><TableProperties size={18} /> Base CYPE Murcia</>}
            </button>
          ))}
        </div>

        <div style={{ padding: '20px' }}>
          <div style={{ display: 'flex', gap: '15px', marginBottom: '20px', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '2', minWidth: '250px' }}>
              <Search size={18} style={{ position: 'absolute', top: '12px', left: '12px', color: 'var(--text-light)' }} />
              <input
                type="text"
                placeholder="Buscar por código o descripción..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                style={{ width: '100%', paddingLeft: '40px' }}
              />
            </div>
            <div style={{ flex: '1', minWidth: '200px' }}>
              <select
                value={selectedCategory}
                onChange={e => setSelectedCategory(e.target.value)}
                style={{ width: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)' }}
              >
                <option value="">Todas las categorías</option>
                {categoriasDisponibles.map((cat, idx) => (
                  <option key={idx} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Categoría</th>
                  <th>Descripción</th>
                  <th>Ud.</th>
                  <th>M.O. (€)</th>
                  <th>Mat/Otros (€)</th>
                  <th>Maq. (€)</th>
                  <th>Precio Total (€)</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {data.map(item => (
                  <tr key={item.id}>
                    <td style={{ fontWeight: 'bold' }}>{item.codigo}</td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{item.categoria}</td>
                    <td style={{ maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                      title={item.descripcion_corta}>{item.descripcion_corta}</td>
                    <td>{item.unidad}</td>

                    {editingId === item.id ? (
                      <>
                        <td><input type="number" style={{ width: '70px', padding: '4px' }} value={editValues.mano_de_obra} onChange={e => setEditValues({ ...editValues, mano_de_obra: e.target.value })} /></td>
                        <td><input type="number" style={{ width: '70px', padding: '4px' }} value={editValues.materiales_y_otros} onChange={e => setEditValues({ ...editValues, materiales_y_otros: e.target.value })} /></td>
                        <td><input type="number" style={{ width: '70px', padding: '4px' }} value={editValues.maquinaria} onChange={e => setEditValues({ ...editValues, maquinaria: e.target.value })} /></td>
                        <td><input type="number" style={{ width: '70px', padding: '4px', fontWeight: 'bold' }} value={editValues.precio_total} onChange={e => setEditValues({ ...editValues, precio_total: e.target.value })} /></td>
                        <td>
                          <div style={{ display: 'flex', gap: '5px' }}>
                            <button className="btn btn-success" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => handleSaveEdit(item.id)} disabled={saving}>
                              {saving ? '...' : <Save size={14} />}
                            </button>
                            <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => setEditingId(null)}>X</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{item.mano_de_obra}</td>
                        <td>{activeTab === 'adir' ? item.materiales_y_otros : item.materiales}</td>
                        <td>{item.maquinaria || 0}</td>
                        <td style={{ fontWeight: 'bold', color: 'var(--primary)' }}>{item.precio_total}</td>
                        <td>
                          <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => handleEditClick(item)}>
                            Editar
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>

            {loading && (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <Loader2 className="loader-spinner" style={{ display: 'inline-block' }} />
              </div>
            )}
            {!loading && data.length === 0 && (
              <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-muted)' }}>
                No se encontraron resultados.
              </div>
            )}
            {!loading && hasMore && data.length > 0 && (
              <div style={{ textAlign: 'center', padding: '20px' }}>
                <button className="btn btn-secondary" onClick={() => setPage(p => p + 1)}>Cargar más</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default BasePrecios;
