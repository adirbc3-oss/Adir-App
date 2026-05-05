import React, { useState, useCallback } from 'react';
import { CheckCircle, AlertTriangle, X, Info, AlertCircle } from 'lucide-react';

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
            background: toast.type === 'error' ? '#fee2e2' : toast.type === 'warning' ? '#fef3c7' : '#dcfce7',
            color: toast.type === 'error' ? '#991b1b' : toast.type === 'warning' ? '#92400e' : '#166534',
            border: `1px solid ${toast.type === 'error' ? '#fecaca' : toast.type === 'warning' ? '#fde68a' : '#bbf7d0'}`,
            boxShadow: '0 8px 24px rgba(0,0,0,0.12)', maxWidth: 420,
            animation: 'fadeIn 0.3s ease'
        }}>
            {toast.msg}
        </div>
    ) : null;

    return { showToast, ToastUI };
};

// ─── Modal de Alerta (reemplaza alert()) ──────────────────────────────────────
export const AlertModal = ({ title, message, type = 'info', onClose }) => {
    const icons = {
        success: { icon: <CheckCircle size={32} color="#16a34a" />, bg: 'rgba(22,163,74,0.1)' },
        error: { icon: <AlertCircle size={32} color="#dc2626" />, bg: 'rgba(220,38,38,0.1)' },
        warning: { icon: <AlertTriangle size={32} color="#d97706" />, bg: 'rgba(245,158,11,0.1)' },
        info: { icon: <Info size={32} color="#2563eb" />, bg: 'rgba(37,99,235,0.1)' },
    };
    const { icon, bg } = icons[type] || icons.info;

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    {icon}
                </div>
                {title && <h3 style={{ margin: '0 0 10px', color: 'var(--text-primary)', fontSize: '1.15rem' }}>{title}</h3>}
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 24px', fontSize: '0.9rem', whiteSpace: 'pre-line' }}>{message}</p>
                <button onClick={onClose} className="btn btn-primary" style={{ width: '100%' }}>Aceptar</button>
            </div>
        </div>
    );
};

// ─── Modal de Confirmación (reemplaza window.confirm()) ───────────────────────
export const ConfirmModal = ({ title, message, type = 'info', confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', onConfirm, onCancel }) => {
    const icons = {
        success: { icon: <CheckCircle size={30} color="#16a34a" />, bg: 'rgba(22,163,74,0.1)', btnStyle: { background: '#16a34a', color: 'white', border: 'none' } },
        danger: { icon: <AlertTriangle size={30} color="#dc2626" />, bg: 'rgba(220,38,38,0.1)', btnStyle: { background: '#dc2626', color: 'white', border: 'none' } },
        warning: { icon: <AlertTriangle size={30} color="#d97706" />, bg: 'rgba(245,158,11,0.1)', btnStyle: { background: '#d97706', color: 'white', border: 'none' } },
        info: { icon: <Info size={30} color="#2563eb" />, bg: 'rgba(37,99,235,0.1)', btnStyle: { background: '#2563eb', color: 'white', border: 'none' } },
    };
    const { icon, bg, btnStyle } = icons[type] || icons.info;

    return (
        <div style={overlayStyle}>
            <div style={modalStyle}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
                    {icon}
                </div>
                {title && <h3 style={{ margin: '0 0 10px', color: 'var(--text-primary)', fontSize: '1.15rem' }}>{title}</h3>}
                <p style={{ color: 'var(--text-muted)', lineHeight: 1.6, margin: '0 0 24px', fontSize: '0.9rem' }}>{message}</p>
                <div style={{ display: 'flex', gap: 12 }}>
                    <button onClick={onCancel} className="btn btn-secondary" style={{ flex: 1 }}>{cancelLabel}</button>
                    <button onClick={onConfirm} style={{ flex: 1, padding: '12px', borderRadius: 10, cursor: 'pointer', fontWeight: 700, fontSize: '0.9rem', ...btnStyle }}>{confirmLabel}</button>
                </div>
            </div>
        </div>
    );
};

// ─── Hook de Modal (useModal) ─────────────────────────────────────────────────
export const useModal = () => {
    const [modal, setModal] = useState(null);

    // showAlert(message, { title, type })
    const showAlert = useCallback((message, opts = {}) => {
        setModal({ kind: 'alert', message, title: opts.title, type: opts.type || 'info' });
    }, []);

    // showConfirm(message, onConfirm, { title, type, confirmLabel })
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
    backgroundColor: 'rgba(0,0,0,0.6)',
    backdropFilter: 'blur(8px)',
    zIndex: 100000,
    display: 'flex', alignItems: 'center', justifyContent: 'center'
};

const modalStyle = {
    background: 'var(--bg-card)',
    borderRadius: 20,
    padding: '36px',
    maxWidth: 460,
    width: '90%',
    boxShadow: '0 25px 60px rgba(0,0,0,0.4)',
    textAlign: 'center',
    animation: 'fadeIn 0.25s ease'
};
