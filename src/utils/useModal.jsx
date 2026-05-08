import React, { useState, useCallback } from 'react';
import { CheckCircle, AlertTriangle, X, Info, AlertCircle, Trash2 } from 'lucide-react';

// ─── Toast hook ───────────────────────────────────────────────────────────────
export const useToast = () => {
    const [toast, setToast] = useState(null);

    const showToast = useCallback((msg, type = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    }, []);

    const ToastUI = toast ? (
        <div style={{
            position: 'fixed', bottom: 24, right: 24, zIndex: 200000,
            padding: '14px 22px', borderRadius: 12, fontWeight: 600, fontSize: '0.9rem',
            background: toast.type === 'error' ? '#fef2f2' : toast.type === 'warning' ? '#fffbeb' : '#f0fdf4',
            color: toast.type === 'error' ? '#991b1b' : toast.type === 'warning' ? '#92400e' : '#166534',
            border: `1.5px solid ${toast.type === 'error' ? '#fca5a5' : toast.type === 'warning' ? '#fde68a' : '#86efac'}`,
            boxShadow: '0 8px 32px rgba(0,45,84,0.18)', maxWidth: 420,
            animation: 'fadeIn 0.25s ease',
            display: 'flex', alignItems: 'center', gap: 10
        }}>
            {toast.type === 'error' && <AlertCircle size={18} />}
            {toast.type === 'warning' && <AlertTriangle size={18} />}
            {toast.type === 'success' && <CheckCircle size={18} />}
            {toast.msg}
        </div>
    ) : null;

    return { showToast, ToastUI };
};

// ─── Modal de Alerta (reemplaza alert()) ─────────────────────────────────────
export const AlertModal = ({ title, message, type = 'info', onClose }) => {
    const cfg = {
        success: { icon: <CheckCircle size={28} color="#16a34a" />, ring: '#16a34a', bg: '#f0fdf4', border: '#86efac' },
        error:   { icon: <AlertCircle  size={28} color="#dc2626" />, ring: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
        warning: { icon: <AlertTriangle size={28} color="#d97706" />, ring: '#d97706', bg: '#fffbeb', border: '#fde68a' },
        info:    { icon: <Info size={28} color="var(--primary)" />, ring: 'var(--primary)', bg: '#e5edf7', border: '#c7d5e6' },
    };
    const { icon, ring, bg, border } = cfg[type] || cfg.info;

    return (
        <div style={overlayStyle}>
            <div style={{ ...modalStyle, border: `1.5px solid ${border}` }}>
                <div style={{
                    width: 60, height: 60, borderRadius: '50%',
                    background: bg, border: `2px solid ${border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px'
                }}>
                    {icon}
                </div>
                {title && <h3 style={{ margin: '0 0 10px', color: '#1D1D1B', fontSize: '1.15rem', fontWeight: 700 }}>{title}</h3>}
                <p style={{ color: '#50504d', lineHeight: 1.7, margin: '0 0 24px', fontSize: '0.9rem', whiteSpace: 'pre-line' }}>{message}</p>
                <button
                    onClick={onClose}
                    style={{ width: '100%', padding: '12px', borderRadius: 10, border: 'none', background: ring, color: 'white', fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer' }}
                >
                    Aceptar
                </button>
            </div>
        </div>
    );
};

// ─── Modal de Confirmación (reemplaza window.confirm()) ──────────────────────
export const ConfirmModal = ({ title, message, type = 'info', confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', onConfirm, onCancel }) => {
    const cfg = {
        success: { icon: <CheckCircle size={28} color="#16a34a" />, bg: '#f0fdf4', border: '#86efac', btnBg: '#16a34a' },
        danger:  { icon: <Trash2 size={28} color="#dc2626" />,      bg: '#fef2f2', border: '#fca5a5', btnBg: '#dc2626' },
        warning: { icon: <AlertTriangle size={28} color="#d97706" />,bg: '#fffbeb', border: '#fde68a', btnBg: '#d97706' },
        info:    { icon: <Info size={28} color="var(--primary)" />,         bg: '#e5edf7', border: '#c7d5e6', btnBg: 'var(--primary)' },
    };
    const { icon, bg, border, btnBg } = cfg[type] || cfg.info;

    return (
        <div style={overlayStyle}>
            <div style={{ ...modalStyle, border: `1.5px solid ${border}` }}>
                <div style={{
                    width: 60, height: 60, borderRadius: '50%',
                    background: bg, border: `2px solid ${border}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 18px'
                }}>
                    {icon}
                </div>
                {title && <h3 style={{ margin: '0 0 10px', color: '#1D1D1B', fontSize: '1.15rem', fontWeight: 700 }}>{title}</h3>}
                <p style={{ color: '#50504d', lineHeight: 1.7, margin: '0 0 24px', fontSize: '0.9rem' }}>{message}</p>
                <div style={{ display: 'flex', gap: 12 }}>
                    <button
                        onClick={onCancel}
                        style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1.5px solid #c7d5e6', background: 'white', color: '#374151', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none', background: btnBg, color: 'white', fontWeight: 700, fontSize: '0.9rem', cursor: 'pointer' }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Hook de Modal (useModal) ─────────────────────────────────────────────────
export const useModal = () => {
    const [modal, setModal] = useState(null);

    const showAlert = useCallback((message, opts = {}) => {
        setModal({ kind: 'alert', message, title: opts.title, type: opts.type || 'info' });
    }, []);

    const showConfirm = useCallback((message, onConfirm, opts = {}) => {
        setModal({
            kind: 'confirm',
            message,
            title: opts.title,
            type: opts.type || 'info',
            confirmLabel: opts.confirmLabel || 'Confirmar',
            cancelLabel: opts.cancelLabel || 'Cancelar',
            onConfirm: () => { setModal(null); onConfirm(); }
        });
    }, []);

    const closeModal = useCallback(() => setModal(null), []);

    const ModalUI = modal ? (
        modal.kind === 'alert'
            ? <AlertModal title={modal.title} message={modal.message} type={modal.type} onClose={closeModal} />
            : <ConfirmModal
                title={modal.title}
                message={modal.message}
                type={modal.type}
                confirmLabel={modal.confirmLabel}
                cancelLabel={modal.cancelLabel}
                onConfirm={modal.onConfirm}
                onCancel={closeModal}
            />
    ) : null;

    return { showAlert, showConfirm, closeModal, ModalUI };
};

// ─── Estilos compartidos ──────────────────────────────────────────────────────
const overlayStyle = {
    position: 'fixed', inset: 0,
    backgroundColor: 'rgba(0, 45, 84, 0.6)',
    backdropFilter: 'blur(6px)',
    zIndex: 100000,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '20px',
    animation: 'fadeIn 0.15s ease'
};

const modalStyle = {
    background: 'var(--bg-card)',
    borderRadius: 20,
    padding: '36px',
    maxWidth: 460,
    width: '100%',
    boxShadow: '0 32px 80px rgba(0,45,84,0.15), 0 0 0 1px rgba(255,255,255,0.05)',
    textAlign: 'center',
    animation: 'slideUp 0.25s ease'
};
