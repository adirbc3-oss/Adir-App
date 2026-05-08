import React, { useState } from 'react';
import { UploadCloud, CheckCircle, Loader2 } from 'lucide-react';
import { supabase } from '../utils/supabaseClient';
import { parseBC3 } from '../utils/bc3Parser';
import { useToast } from '../utils/useModal';

const NuevoProyecto = () => {
    const [file, setFile] = useState(null);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const { showToast, ToastUI } = useToast();

    const handleDrop = (e) => {
        e.preventDefault();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile && droppedFile.name.toLowerCase().endsWith('.bc3')) {
            setFile(droppedFile);
            setSuccess(false);
        } else {
            showToast("Por favor, suelta un archivo .bc3 válido.", "error");
        }
    };

    const handleFileChange = (e) => {
        const selectedFile = e.target.files[0];
        if (selectedFile && selectedFile.name.toLowerCase().endsWith('.bc3')) {
            setFile(selectedFile);
            setSuccess(false);
        }
    };

    const processFile = () => {
        if (!file) return;
        setLoading(true);

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const text = e.target.result;
                const partidasFlat = parseBC3(text);
                const projectName = file.name.replace(/\.bc3$/i, '');
                
                let idUnico = projectName;
                let suffix = 1;
                let collision = true;
                
                while (collision) {
                    const { data: existing } = await supabase
                        .from('propuestas')
                        .select('Proyecto')
                        .eq('Proyecto', idUnico)
                        .maybeSingle();
                        
                    if (existing) {
                        idUnico = `${projectName}_${suffix}`;
                        suffix++;
                    } else {
                        collision = false;
                    }
                }

                const { data: propData, error: propError } = await supabase
                    .from('propuestas')
                    .insert([{ 
                        Proyecto: idUnico, 
                        cliente: projectName, 
                        estado: 'Borrador',
                        fecha_recepcion: new Date().toISOString().split('T')[0]
                    }])
                    .select();

                if (propError) throw propError;
                const propuestaId = propData[0].Proyecto;

                // Borrar partidas existentes si se está sobreescribiendo el mismo archivo
                const { error: deleteError } = await supabase
                    .from('partidas')
                    .delete()
                    .eq('propuesta_id', propuestaId);

                if (deleteError) throw deleteError;

                const mappedPartidas = partidasFlat.map((p, index) => ({
                    id: `${propuestaId}-${index}-${p.Capítulo}`,
                    propuesta_id: propuestaId,
                    texto_partida: `${p.Capítulo}::${p.Descripción}`,
                    oficio_asignado: null,
                    cantidad: Number(p.Cantidad) || 0,
                    precio_base_estimado: Number(p['Precio Total (€)']) || 0
                }));

                const { error: partError } = await supabase
                    .from('partidas')
                    .insert(mappedPartidas);

                if (partError) throw partError;

                setSuccess(true);
                setFile(null);
                showToast("¡Proyecto sincronizado con Supabase!");
            } catch (error) {
                console.error(error);
                showToast("Error procesando fichero: " + error.message, 'error');
            } finally {
                setLoading(false);
            }
        };
        reader.readAsText(file, 'ISO-8859-1');
    };

    return (
        <div className="animate-fade-in">
            <h1>🚀 Procesar Nuevo BC3</h1>
            <p>Sincronización directa de presupuestos Presto con la base de datos central.</p>

            {ToastUI}

            {success && (
                <div className="glass-card animate-fade-in" style={{ marginTop: '24px', borderLeft: '4px solid var(--success)' }}>
                    <h2 style={{ color: 'var(--success)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle /> ¡Proyecto Subido con Éxito!
                    </h2>
                    <p>Las partidas han sido guardadas. Ya puedes gestionarlo en "Borradores en Curso".</p>
                </div>
            )}

            <div className="glass-card" style={{ marginTop: '24px' }}>
                <div
                    className={`dropzone ${file ? 'active' : ''}`}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={handleDrop}
                    onClick={() => document.getElementById('file-upload').click()}
                >
                    <UploadCloud className="dropzone-icon" />
                    {file ? (
                        <div>
                            <h3>{file.name}</h3>
                            <p style={{ marginTop: '8px' }}>{(file.size / 1024).toFixed(2)} KB pronto para procesar</p>
                        </div>
                    ) : (
                        <div>
                            <h3>Selecciona tu archivo .bc3</h3>
                            <p>Arrastra y suelta aquí o haz clic para buscar</p>
                        </div>
                    )}
                    <input
                        id="file-upload"
                        type="file"
                        accept=".bc3"
                        style={{ display: 'none' }}
                        onChange={handleFileChange}
                    />
                </div>

                {file && !loading && (
                    <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button className="btn btn-secondary" onClick={() => setFile(null)}>Cancelar</button>
                        <button className="btn btn-primary" onClick={processFile}>
                            Importar a Supabase
                        </button>
                    </div>
                )}

                {loading && (
                    <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-center', alignItems: 'center', gap: '8px', color: 'var(--primary)' }}>
                        <Loader2 className="loader-spinner" /> <strong>Analizando y Sincronizando BC3...</strong>
                    </div>
                )}
            </div>
        </div>
    );
};

export default NuevoProyecto;
