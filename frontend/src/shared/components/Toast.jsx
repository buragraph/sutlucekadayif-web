import { useState, createContext, useContext, useCallback } from 'react';
import { toast as sonnerToast } from 'sonner';
import { AlertTriangle } from 'lucide-react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';

const ConfirmContext = createContext(null);

// ─── Toast Provider (now uses Sonner for toasts, AlertDialog for confirm) ───
export function ToastProvider({ children }) {
    const [confirmState, setConfirmState] = useState(null);

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

    return (
        <ConfirmContext.Provider value={confirm}>
            {children}

            {/* Confirm dialog — shadcn AlertDialog */}
            <AlertDialog open={!!confirmState} onOpenChange={(open) => !open && handleConfirm(false)}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <AlertTriangle className="size-5 text-destructive" />
                            Emin misiniz?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmState?.message}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel onClick={() => handleConfirm(false)}>
                            İptal
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => handleConfirm(true)}
                            className={buttonVariants({ variant: 'destructive' })}
                        >
                            Evet, Devam Et
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </ConfirmContext.Provider>
    );
}

/**
 * Drop-in replacement: returns the same API as before.
 * toast.success(msg), toast.error(msg), toast.warning(msg), toast.info(msg)
 */
export function useToast() {
    const toastFn = (msg, type) => {
        if (type === 'success') sonnerToast.success(msg);
        else if (type === 'error') sonnerToast.error(msg);
        else if (type === 'warning') sonnerToast.warning(msg);
        else sonnerToast.info(msg);
    };
    toastFn.success = (msg) => sonnerToast.success(msg);
    toastFn.error = (msg) => sonnerToast.error(msg);
    toastFn.warning = (msg) => sonnerToast.warning(msg);
    toastFn.info = (msg) => sonnerToast.info(msg);
    return toastFn;
}

export function useConfirm() {
    const ctx = useContext(ConfirmContext);
    if (!ctx) throw new Error('useConfirm must be used within ToastProvider');
    return ctx;
}
