import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { X, CheckCircle, AlertTriangle, Info, XCircle } from 'lucide-react';

const ToastContext = createContext(null);
const ConfirmContext = createContext(null);

// ─── Toast Provider ───
export function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const [confirmState, setConfirmState] = useState(null);

    const addToast = useCallback((message, type = 'info', duration = 3500) => {
        const id = Date.now() + Math.random();
        setToasts((prev) => [...prev, { id, message, type }]);
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, duration);
    }, []);

    const toast = useCallback({
        success: (msg) => addToast(msg, 'success'),
        error: (msg) => addToast(msg, 'error', 5000),
        warning: (msg) => addToast(msg, 'warning', 4000),
        info: (msg) => addToast(msg, 'info'),
    }, [addToast]);

    // Make toast callable: toast.success(...) etc.
    const toastFn = useCallback((msg, type) => addToast(msg, type), [addToast]);
    toastFn.success = toast.success;
    toastFn.error = toast.error;
    toastFn.warning = toast.warning;
    toastFn.info = toast.info;

    const confirm = useCallback((message) => {
        return new Promise((resolve) => {
            setConfirmState({ message, resolve });
        });
    }, []);

    const handleConfirm = (result) => {
        if (confirmState) {
            confirmState.resolve(result);
            setConfirmState(null);
        }
    };

    const removeToast = (id) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    };

    const icons = {
        success: <CheckCircle size={18} />,
        error: <XCircle size={18} />,
        warning: <AlertTriangle size={18} />,
        info: <Info size={18} />,
    };

    return (
        <ToastContext.Provider value={toastFn}>
            <ConfirmContext.Provider value={confirm}>
                {children}

                {/* Toast container */}
                <div className="toast-container">
                    {toasts.map((t) => (
                        <div key={t.id} className={`toast toast--${t.type}`}>
                            <span className="toast__icon">{icons[t.type]}</span>
                            <span className="toast__message">{t.message}</span>
                            <button className="toast__close" onClick={() => removeToast(t.id)}>
                                <X size={14} />
                            </button>
                        </div>
                    ))}
                </div>

                {/* Confirm dialog */}
                {confirmState && (
                    <div className="confirm-overlay" onClick={() => handleConfirm(false)}>
                        <div className="confirm-dialog" onClick={(e) => e.stopPropagation()}>
                            <div className="confirm-dialog__icon">
                                <AlertTriangle size={28} />
                            </div>
                            <p className="confirm-dialog__message">{confirmState.message}</p>
                            <div className="confirm-dialog__actions">
                                <button className="btn btn--secondary" onClick={() => handleConfirm(false)}>İptal</button>
                                <button className="btn btn--danger" onClick={() => handleConfirm(true)}>Evet, Devam Et</button>
                            </div>
                        </div>
                    </div>
                )}
            </ConfirmContext.Provider>
        </ToastContext.Provider>
    );
}

export function useToast() {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error('useToast must be used within ToastProvider');
    return ctx;
}

export function useConfirm() {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm must be used within ToastProvider');
    return ctx;
}
