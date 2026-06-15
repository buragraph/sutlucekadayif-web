import { useState, useEffect } from 'react';
import api from '../../../services/api';
import { User, Store, ReceiptText } from 'lucide-react';
import {
    Card, CardHeader, CardTitle, CardDescription, CardContent,
} from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';

// Etiket + değer satırı (boşsa —)
function Alan({ label, value, className = '' }) {
    return (
        <div className={`flex flex-col gap-0.5 ${className}`}>
            <span className="text-xs text-muted-foreground">{label}</span>
            <span className="text-sm font-medium text-foreground">{value || '—'}</span>
        </div>
    );
}

// Yükleme iskeleti — sayfa düzenini taklit eder
function ProfilIskelet() {
    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
                <Skeleton className="h-8 w-40" />
                <Skeleton className="h-4 w-56" />
            </div>
            <div className="grid gap-4 md:grid-cols-2">
                {[0, 1, 2].map((i) => (
                    <Card key={i} className={i === 2 ? 'md:col-span-2' : ''}>
                        <CardHeader>
                            <Skeleton className="h-5 w-32" />
                        </CardHeader>
                        <CardContent className="grid gap-4 sm:grid-cols-2">
                            <Skeleton className="h-9" />
                            <Skeleton className="h-9" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
}

export default function ProfilePage() {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get('/profil')
            .then(({ data }) => setData(data))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, []);

    if (loading) return <ProfilIskelet />;

    if (!data) {
        return (
            <Alert variant="destructive">
                <AlertTitle>Profil yüklenemedi</AlertTitle>
                <AlertDescription>
                    Bilgiler alınırken bir sorun oluştu. Lütfen sayfayı yenileyin.
                </AlertDescription>
            </Alert>
        );
    }

    const { hesap, magaza, fatura } = data;

    return (
        <div className="flex flex-col gap-6">
            {/* Başlık */}
            <div className="flex flex-col gap-1">
                <h1 className="text-3xl leading-none tracking-tight text-foreground">Profil</h1>
                <p className="text-sm text-muted-foreground">Hesap ve mağaza bilgileriniz</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                {/* Hesap */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <User className="size-4 text-muted-foreground" />
                            Hesap
                        </CardTitle>
                        <CardDescription>İletişim ve giriş bilgileriniz</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                        <Alan label="Ad Soyad" value={hesap.ad_soyad} />
                        <Alan label="Telefon" value={hesap.telefon} />
                        <Alan label="E-posta" value={hesap.email} className="sm:col-span-2" />
                    </CardContent>
                </Card>

                {/* Mağaza */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Store className="size-4 text-muted-foreground" />
                            Mağaza
                        </CardTitle>
                        <CardDescription>Şubenizin konum bilgileri</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-2">
                        <Alan label="Şube" value={magaza.ad} />
                        <Alan label="İl / İlçe" value={[magaza.il, magaza.ilce].filter(Boolean).join(' / ')} />
                        <Alan label="Adres" value={magaza.adres} className="sm:col-span-2" />
                    </CardContent>
                </Card>

                {/* Fatura & Vergi */}
                <Card className="md:col-span-2">
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ReceiptText className="size-4 text-muted-foreground" />
                            Fatura & Vergi
                        </CardTitle>
                        <CardDescription>Faturalandırma ve vergi bilgileri</CardDescription>
                    </CardHeader>
                    <CardContent className="grid gap-4 sm:grid-cols-3">
                        <Alan label="Vergi No (VKN)" value={fatura.vkn} />
                        <Alan label="Şirket Tipi" value={fatura.sirket_tipi} />
                        <Alan label="Fatura Adresi" value={fatura.fatura_adresi} className="sm:col-span-3" />
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
