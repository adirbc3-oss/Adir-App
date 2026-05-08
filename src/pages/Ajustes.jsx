import React, { useState, useEffect } from 'react';
import { Save, Loader2, Settings, Key, Mail } from 'lucide-react';
import { useToast } from '../utils/useModal';

const Ajustes = () => {
    const { showToast, ToastUI } = useToast();
    const [emailConfig, setEmailConfig] = useState({ correo: '', password: '' });
    const [mistralKey, setMistralKey] = useState('');
    const [mistralConfigured, setMistralConfigured] = useState(false);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savingMistral, setSavingMistral] = useState(false);



    useEffect(() => {
        // Leer configuración desde localStorage (no necesita servidor)
        const savedKey = localStorage.getItem('mistral_api_key');
        if (savedKey && savedKey.length > 10) {
            setMistralConfigured(true);
        }
        const savedEmail = localStorage.getItem('email_config');
        if (savedEmail) {
            try { setEmailConfig(JSON.parse(savedEmail)); } catch (e) { console.error("Error parsing email config", e); }
        }
        setLoading(false);
    }, []);

    const handleSaveEmail = (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            localStorage.setItem('email_config', JSON.stringify(emailConfig));
            showToast("Credenciales de correo guardadas correctamente");
        } catch (err) {
            showToast("Error al guardar las credenciales de correo", "error");
        } finally {
            setSaving(false);
        }
    };

    const handleSaveMistral = (e) => {
        e.preventDefault();
        if (!mistralKey || mistralKey.trim().length < 10) {
            showToast("Introduce una API Key de Mistral válida (más de 10 caracteres)", "error");
            return;
        }
        setSavingMistral(true);
        try {
            localStorage.setItem('mistral_api_key', mistralKey.trim());
            setMistralConfigured(true);
            showToast("API Key de Mistral guardada correctamente ✅");
        } catch (err) {
            showToast("Error al guardar la API Key de Mistral", "error");
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
                    <div className="glass-card" style={{ border: mistralConfigured ? '1px solid #16a34a' : '1px solid var(--accent-primary)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                            <Key size={22} color="var(--accent-primary)" />
                            <h2 style={{ margin: 0 }}>🤖 IA de Asignación — Mistral API</h2>
                            {mistralConfigured && <span className="badge badge-green" style={{ marginLeft: 'auto' }}>✅ Configurada</span>}
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            La IA de asignación de partidas utiliza Mistral para obtener resultados de alta precisión.
                            Obtén tu clave gratuita en{' '}
                            <a href="https://console.mistral.ai" target="_blank" rel="noopener noreferrer">console.mistral.ai</a>.
                        </p>
                        <form onSubmit={handleSaveMistral}>
                            <div className="form-group">
                                <label>API Key de Mistral</label>
                                <input
                                    type="password"
                                    value={mistralKey}
                                    onChange={e => setMistralKey(e.target.value)}
                                    placeholder={mistralConfigured ? "La clave ya está guardada (escribe una nueva para cambiarla)" : "Pega aquí tu API Key de Mistral..."}
                                    style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc', fontFamily: 'monospace' }}
                                />
                            </div>
                            <button type="submit" className="btn btn-primary" disabled={savingMistral} style={{ marginTop: '16px' }}>
                                {savingMistral ? <Loader2 className="loader-spinner" size={16} /> : <Save size={16} />}
                                {savingMistral ? ' Guardando...' : ' Guardar API Key'}
                            </button>
                        </form>
                    </div>

                    {/* CORREO */}
                    <div className="glass-card">
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                            <Mail size={22} color="var(--accent-primary)" />
                            <h2 style={{ margin: 0 }}>📧 Configuración de Correo</h2>
                        </div>
                        <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '16px' }}>
                            Para alertas automáticas a proveedores. Usa 'Contraseñas de aplicación' de Gmail o Outlook.
                        </p>
                        <form onSubmit={handleSaveEmail}>
                            <div className="form-group">
                                <label>Correo Emisor</label>
                                <input
                                    type="email"
                                    value={emailConfig.correo}
                                    onChange={e => setEmailConfig({ ...emailConfig, correo: e.target.value })}
                                    placeholder="tu-correo@gmail.com"
                                    style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
                                />
                            </div>
                            <div className="form-group" style={{ marginTop: '16px' }}>
                                <label>Contraseña de Aplicación</label>
                                <input
                                    type="password"
                                    value={emailConfig.password}
                                    onChange={e => setEmailConfig({ ...emailConfig, password: e.target.value })}
                                    placeholder="••••••••••••"
                                    style={{ width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid #ccc' }}
                                />
                            </div>
                            <button type="submit" className="btn btn-success" disabled={saving} style={{ marginTop: '20px' }}>
                                {saving ? <Loader2 className="loader-spinner" size={16} /> : <Save size={16} />}
                                {saving ? ' Guardando...' : ' Guardar Credenciales'}
                            </button>
                        </form>
                    </div>

                </div>
            )}
        </div>
    );
};

export default Ajustes;
