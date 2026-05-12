import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../utils/supabaseClient';
import { N8N_BASE_URL } from '../config';
import { useToast } from '../utils/useModal';

const Portal = () => {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [solicitud, setSolicitud] = useState(null);
  const [partidas, setPartidas] = useState([]);
  const [precios, setPrecios] = useState({});
  const [comentarios, setComentarios] = useState({});
  const [comentariosGenerales, setComentariosGenerales] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const { showToast, ToastUI } = useToast();

  useEffect(() => {
    const fetchSolicitud = async () => {
      try {
        const token = searchParams.get('token');
        if (!token) throw new Error("Enlace inválido. Falta el token.");

        // Fetch Solicitud (usando limit(1) para evitar el error 406 si hay duplicados por pruebas de n8n)
        const { data: solDataArray, error: solError } = await supabase
          .from('solicitudes')
          .select('*')
          .eq('token', token)
          .limit(1);

        const solData = solDataArray && solDataArray.length > 0 ? solDataArray[0] : null;

        if (solError || !solData) {
            console.error(solError);
            throw new Error("La solicitud no existe, el enlace está corrupto o ha caducado.");
        }
        if (solData.estado === 'Respondido') throw new Error("Esta solicitud ya fue respondida.");

        setSolicitud(solData);

        // Buscar partidas mediante oficio_necesario (SQL Nuevo) o oficio_asignado (Fallback)
        let finalPartData = [];
        const { data: partData } = await supabase
          .from('partidas')
          .select('*')
          .eq('propuesta_id', solData.propuesta_id)
          .eq('oficio_necesario', solData.oficio_solicitado);

        finalPartData = partData || [];

        if (finalPartData.length === 0) {
            const { data: fallbackData } = await supabase
                .from('partidas')
                .select('*')
                .eq('propuesta_id', solData.propuesta_id)
                .eq('oficio_asignado', solData.oficio_solicitado);
            finalPartData = fallbackData || [];
        }

        setPartidas(finalPartData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchSolicitud();
  }, [searchParams]);

  const handlePriceChange = (id, value) => {
    setPrecios({ ...precios, [id]: value });
  };

  const handleComentarioChange = (id, value) => {
    setComentarios({ ...comentarios, [id]: value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const payload = {
        token: solicitud.token,
        solicitud_id: solicitud.id,
        proveedor_id: solicitud.proveedor_id,
        precios: partidas.map(p => ({
          partida_id: p.id,
          precio_ofertado: parseFloat(precios[p.id] || 0),
          comentarios: comentarios[p.id] || ''
        })),
        comentarios_generales: comentariosGenerales
      };

      const webhookUrl = `${N8N_BASE_URL}/webhook/fase5-respuesta`;
      
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error("Error de conexión con el sistema.");
      setSuccess(true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Cargando portal seguro...</div>;
  if (error) return <div style={{ padding: 40, textAlign: 'center', color: 'red' }}><h2>Acceso Denegado</h2><p>{error}</p></div>;
  if (success) return <div style={{ padding: 40, textAlign: 'center', color: 'green' }}><h2>¡Gracias!</h2><p>Precios registrados correctamente. ADIR revisará su propuesta.</p></div>;

  return (
    <div style={{ maxWidth: 800, margin: '40px auto', fontFamily: 'system-ui' }}>
      
      {ToastUI}

      <h1>Portal del Proveedor - ADIR</h1>
      <div style={{ padding: 20, background: '#f8f9fa', borderRadius: 8, marginBottom: 20 }}>
        <h3>Hola, {solicitud.proveedor_nombre || solicitud.proveedores?.nombre || "Proveedor"}</h3>
        <p>Por favor, indica tu precio por cada partida solicitada para <strong>{solicitud.oficio_solicitado}</strong>.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#e9ecef' }}>
              <th style={{ padding: 10, textAlign: 'left' }}>Descripción</th>
              <th style={{ padding: 10, textAlign: 'center' }}>Ud.</th>
              <th style={{ padding: 10, textAlign: 'right' }}>Cantidad</th>
              <th style={{ padding: 10, textAlign: 'right' }}>Precio Unitario (€)</th>
              <th style={{ padding: 10, textAlign: 'left' }}>Observaciones</th>
            </tr>
          </thead>
          <tbody>
            {partidas.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #dee2e6' }}>
                <td style={{ padding: 10 }}>{p.texto_descripcion || p.texto_partida}</td>
                <td style={{ padding: 10, textAlign: 'center' }}>{p.unidad || 'ud'}</td>
                <td style={{ padding: 10, textAlign: 'right' }}>{p.cantidad || 1}</td>
                <td style={{ padding: 10, textAlign: 'right' }}>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    style={{ padding: 8, width: 100, textAlign: 'right', border: '1px solid #ced4da', borderRadius: 4 }}
                    value={precios[p.id] || ''}
                    onChange={(e) => handlePriceChange(p.id, e.target.value)}
                    placeholder="0.00"
                  />
                </td>
                <td style={{ padding: 10 }}>
                  <input
                    type="text"
                    style={{ padding: 8, width: '100%', minWidth: 150, border: '1px solid #ced4da', borderRadius: 4 }}
                    value={comentarios[p.id] || ''}
                    onChange={(e) => handleComentarioChange(p.id, e.target.value)}
                    placeholder="Notas opcionales..."
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        
        <div style={{ marginTop: 24, padding: 20, background: '#f8f9fa', borderRadius: 8, border: '1px solid #dee2e6' }}>
          <h4 style={{ margin: '0 0 10px 0', color: '#495057' }}>Anotaciones Generales</h4>
          <p style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: '#6c757d' }}>Si necesitas hacer algún comentario general sobre el proyecto o las condiciones, indícalo aquí:</p>
          <textarea
            style={{ width: '100%', minHeight: 80, padding: 12, borderRadius: 4, border: '1px solid #ced4da', resize: 'vertical' }}
            placeholder="Anotaciones, plazos estimados, condiciones especiales..."
            value={comentariosGenerales}
            onChange={(e) => setComentariosGenerales(e.target.value)}
          />
        </div>

        <div style={{ marginTop: 20, textAlign: 'right' }}>
          <button 
            type="submit" 
            disabled={submitting}
            style={{ padding: '12px 24px', background: '#0d6efd', color: 'white', border: 'none', borderRadius: 4, cursor: submitting ? 'wait' : 'pointer', fontWeight: 'bold' }}>
            {submitting ? 'Enviando...' : 'Enviar Presupuesto'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default Portal;