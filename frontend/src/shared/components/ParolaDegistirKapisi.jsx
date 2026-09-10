import { useState } from 'react';
import { KeyRound } from 'lucide-react';
import api from '../../services/api';
import { useToast } from './Toast';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';

/**
 * Zorunlu parola değişimi — onboarding'den ÖNCE.
 *
 * NEDEN VAR: şube sahibi hesapları merkezin belirlediği parolalarla toplu
 * açılıyor. O parola bir listede duruyor ve en az bir başka kişi tarafından
 * biliniyor; kullanıcı kendi parolasını belirlemeden panele girmemeli.
 *
 * KAPATILAMAZ: `onOpenChange` yok, Escape ve dışarı tıklama engelli, kapatma
 * düğmesi gizli. Bayrağı yalnızca sunucu düşürüyor (POST /api/profil/parola),
 * yani istemciyi atlatmak bayrağı temizlemiyor — bir sonraki açılışta kapı
 * yine karşına çıkar.
 */
const EN_AZ = 8;

export default function ParolaDegistirKapisi({ onTamam }) {
    const toast = useToast();
    const [parola, setParola] = useState('');
    const [tekrar, setTekrar] = useState('');
    const [kaydediliyor, setKaydediliyor] = useState(false);

    const kisa = parola.length > 0 && parola.length < EN_AZ;
    const uyusmuyor = tekrar.length > 0 && parola !== tekrar;
    const gonderilebilir = parola.length >= EN_AZ && parola === tekrar && !kaydediliyor;

    async function kaydet(e) {
        e.preventDefault();
        if (!gonderilebilir) return;
        setKaydediliyor(true);
        try {
            await api.post('/profil/parola', { yeniParola: parola });
            toast.success('Parolanız güncellendi.');
            onTamam();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Parola güncellenemedi.');
        }
        setKaydediliyor(false);
    }

    return (
        <Dialog open>
            <DialogContent
                showCloseButton={false}
                onEscapeKeyDown={(e) => e.preventDefault()}
                onPointerDownOutside={(e) => e.preventDefault()}
                onInteractOutside={(e) => e.preventDefault()}
                className="sm:max-w-md"
            >
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                        <KeyRound className="size-5" /> Parolanızı belirleyin
                    </DialogTitle>
                    <DialogDescription>
                        Hesabınız merkez tarafından geçici bir parolayla açıldı. Devam etmek
                        için kendinize ait yeni bir parola belirlemeniz gerekiyor.
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={kaydet} className="flex flex-col gap-4">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="yeniParola">Yeni parola</Label>
                        <Input
                            id="yeniParola"
                            type="password"
                            autoComplete="new-password"
                            value={parola}
                            onChange={(e) => setParola(e.target.value)}
                            placeholder={`En az ${EN_AZ} karakter`}
                        />
                        {kisa && (
                            <span className="text-destructive text-xs">
                                Parola en az {EN_AZ} karakter olmalı.
                            </span>
                        )}
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="yeniParolaTekrar">Yeni parola (tekrar)</Label>
                        <Input
                            id="yeniParolaTekrar"
                            type="password"
                            autoComplete="new-password"
                            value={tekrar}
                            onChange={(e) => setTekrar(e.target.value)}
                        />
                        {uyusmuyor && (
                            <span className="text-destructive text-xs">Parolalar aynı değil.</span>
                        )}
                    </div>

                    <Button type="submit" disabled={!gonderilebilir}>
                        {kaydediliyor ? <Spinner className="mr-2 size-4" /> : null}
                        Parolayı belirle
                    </Button>
                </form>
            </DialogContent>
        </Dialog>
    );
}
