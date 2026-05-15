import React, { useState, useEffect } from 'react';
import { Save, Loader2, Settings, Key, Mail, AlertTriangle, CheckCircle } from 'lucide-react';
import { useToast } from '../utils/useModal';
import { supabase } from '../utils/supabaseClient';

const Ajustes = () => {
    const { showToast, ToastUI } = useToast();
    const [mistralKey, setMistralKey] = useState('');
    const [mistralConfigured, setMistralConfigured] = useState(false);
    const [loading, setLoading] = useState(true);
    const [savingMistral, setSavingMistral] = useState(false);

    useEffect(() => {
        const init = async () => {
            // Leer clave Mistral desde Supabase (fallback: localStorage)
            try {
                const { data } = await supabase
                    .from('configuracion')
                    .select('valor')
                    .eq('clave', 'mistral_api_key')
                    .maybeSingle();
                if (data?.valor && data.valor.length > 10) {
                    setMistralConfigured(true);
                    // Sincronizar a localStorage como caché local
                    localStorage.setItem('mistral_api_key', data.valor);
                    return;
                }
            } catch (_) {}
            // Fallback a localStorage
            const cached = localStorage.getItem('mistral_api_key');
            if (cached && cached.length > 10) setMistralConfigured(true);
            setLoading(false);
        };
        init().finally(() => setLoading(false));
    }, []);

    const handleSaveMistral = async (e) => {
        e.preventDefault();
        const key = mistralKey.trim();
        if (!key || key.length < 10) {
            showToast("Introduce una API Key de Mistral válida (más de 10 caracteres)", "error");
            return;
        }
        setSavingMistral(true);
        try {
            // Guardar en Supabase (disponible desde cualquier navegador)
            const { error } = await supabase
                .from('configuracion')
                .upsert({ clave: 'mistral_api_key', valor: key, updated_at: new Date().toISOString() }, { onConflict: 'clave' });
            if (error) throw error;
            // También en localStorage como caché inmediata
            localStorage.setItem('mistral_api_key', key);
            setMistralConfigured(true);
            setMistralKey('');
            showToast("API Key guardada en la nube ✅ — disponible desde cualquier navegador");
        } catch (err) {
            showToast("Error al guardar la API Key: " + err.message, "error");
        } finally {
            setSavingMistral(false);
        }
    };

    return (
        <div className="animate-fade-in">
            <div style={{ marginBottom: '24px' }}>
                <h1><Settings size={28} style={{ verticalAlign: 'middle', marginRight: '10px' }} /> Ajustes</h1>
                <p>Configuración general de la aplicación.</p>
            </div>

            {ToastUI}

            {loading ? (
                <div style={{ padding: '40px', textAlign: 'center' }}><Loader2 className="loader-spinner" /> Cargando configuración...</div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '680px' }}>

                    {/* MISTRAL API */}
                    <div className="glass-card" style={{ border: mistralConfigured ? '1px solid var(--success)' : '1px solid var(--primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                            <Key size={22} color="var(--primary)" />
                            <h2 style={{ margin: 0 }}>Inteligencia Artificial — Mistral</h2>
                            {mistralConfigured && (
                                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--success)', fontSize: '0.85rem', fontWeight: 600 }}>
                                    <CheckCircle size={14} /> Configurada
                                </span>
                            )}
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                            La clave se guarda en la base de datos de la app — no tendrás que introducirla de nuevo desde ningún navegador.
                            Obtén tu clave en{' '}
                            <a href="https://console.mistral.ai" target="_blank" rel="noopener noreferrer">console.mistral.ai</a>.
                        </p>
                        <form onSubmit={handleSaveMistral}>
                            <div className="form-group">
                                <label>API Key de Mistral</label>
                                <input
                                    type="password"
                                    value={mistralKey}
                                    onChange={e => setMistralKey(e.target.value)}
                                    placeholder={mistralConfigured ? "Clave ya guardada — escribe una nueva para reemplazarla" : "Pega aquí tu API Key de Mistral..."}
                                    style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid var(--border-color)', fontFamily: 'monospace' }}
                                />
                            </div>
                            <button type="submit" className="btn btn-primary" disabled={savingMistral} style={{ marginTop: '16px' }}>
                                {savingMistral ? <Loader2 className="loader-spinner" size={16} /> : <Save size={16} />}
                                {savingMistral ? ' Guardando...' : ' Guardar en la nube'}
                            </button>
                        </form>
                    </div>

                    {/* CORREO — informativo */}
                    <div className="glass-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                            <Mail size={22} color="var(--primary)" />
                            <h2 style={{ margin: 0 }}>Configuración de Correo</h2>
                        </div>

                        {/* Aviso de arquitectura fija */}
                        <div style={{ display: 'flex', gap: '10px', padding: '12px 14px', background: '#fff8e1', border: '1px solid #f59e0b', borderRadius: '8px', marginBottom: '16px' }}>
                            <AlertTriangle size={18} color="#d97706" style={{ flexShrink: 0, marginTop: '1px' }} />
                            <div style={{ fontSize: '0.83rem', color: '#92400e' }}>
                                <strong>El envío de correos está gestionado por n8n + Brevo</strong>, no directamente desde la app.
                                El correo emisor fijo es <code style={{ background: '#fef3c7', padding: '1px 4px', borderRadius: '3px' }}>adirbc3@gmail.com</code> configurado en el workflow de n8n.
                                Cambiarlo aquí <strong>no afectaría</strong> al envío real — para modificarlo hay que actualizar los nodos "Enviar Email (Brevo)" en n8n.
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                            <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>CORREO EMISOR (n8n)</div>
                                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--primary)' }}>adirbc3@gmail.com</div>
                            </div>
                            <div style={{ padding: '12px', background: 'var(--bg-secondary)', borderRadius: '6px' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px' }}>PROVEEDOR DE ENVÍO</div>
                                <div style={{ fontFamily: 'monospace', fontSize: '0.9rem', color: 'var(--primary)' }}>Brevo API</div>
                            </div>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
};

export default Ajustes;
