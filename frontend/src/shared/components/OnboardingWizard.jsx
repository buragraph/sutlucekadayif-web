import { useState, useMemo } from 'react';
import { User, MapPin, ArrowLeft, ArrowRight, Check } from 'lucide-react';
import api from '../../services/api';
import { useToast } from './Toast';
import ilIlceData from '../../data/tr-iller-ilceler.json';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import {
    Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// İller (Türkçe sıralı)
const ILLER = Object.keys(ilIlceData).sort((a, b) => a.localeCompare(b, 'tr'));

// ── Adım yapılandırması — yeni soru eklemek için buraya alan/adım ekle ──
// field.type: 'text' | 'tel' | 'textarea' | 'il' | 'ilce'
const STEPS = [
    {
        id: 'kisisel',
        title: 'Kişisel Bilgiler',
        description: 'Sizinle iletişim kurabilmemiz için.',
        icon: User,
        fields: [
            { name: 'ad_soyad', label: 'Ad Soyad', type: 'text', placeholder: 'Ör. Ahmet Yılmaz' },
            { name: 'telefon', label: 'Telefon', type: 'tel', placeholder: 'Ör. 0532 123 45 67' },
        ],
    },
    {
        id: 'sube',
        title: 'Şube Bilgileri',
        description: 'Şubenizin konum ve adres bilgileri.',
        icon: MapPin,
        fields: [
            { name: 'il', label: 'İl', type: 'il' },
            { name: 'ilce', label: 'İlçe', type: 'ilce' },
            { name: 'adres', label: 'Açık Adres', type: 'textarea', placeholder: 'Mahalle, cadde, kapı no...' },
        ],
    },
];

const TUM_ALANLAR = STEPS.flatMap((s) => s.fields.map((f) => f.name));

export default function OnboardingWizard({ prefill = {}, onComplete }) {
    const toast = useToast();
    const [stepIndex, setStepIndex] = useState(0);
    const [saving, setSaving] = useState(false);
    const [form, setForm] = useState(() =>
        Object.fromEntries(TUM_ALANLAR.map((k) => [k, prefill[k] || '']))
    );

    const step = STEPS[stepIndex];
    const isLast = stepIndex === STEPS.length - 1;
    const progress = Math.round(((stepIndex + 1) / STEPS.length) * 100);

    const ilceler = useMemo(() => (form.il ? (ilIlceData[form.il] || []) : []), [form.il]);

    function setField(name, value) {
        setForm((f) => {
            const next = { ...f, [name]: value };
            if (name === 'il') next.ilce = ''; // il değişince ilçe sıfırlanır
            return next;
        });
    }

    // Mevcut adımın geçerliliği — tüm alanlar dolu mu (akış zorunlu)
    function stepGecerli() {
        return step.fields.every((f) => {
            const v = (form[f.name] || '').trim();
            if (!v) return false;
            if (f.type === 'tel') return v.replace(/\D/g, '').length >= 10;
            return true;
        });
    }

    function ileri() {
        if (!stepGecerli()) {
            toast.error('Lütfen tüm alanları doldurun.');
            return;
        }
        if (isLast) return kaydet();
        setStepIndex((i) => i + 1);
    }

    async function kaydet() {
        setSaving(true);
        try {
            await api.post('/onboarding/complete', form);
            toast.success('Bilgileriniz kaydedildi. Hoş geldiniz!');
            onComplete?.();
        } catch (err) {
            toast.error(err.response?.data?.error || 'Kayıt sırasında bir hata oluştu.');
        } finally {
            setSaving(false);
        }
    }

    function renderField(f) {
        const value = form[f.name] || '';
        if (f.type === 'textarea') {
            return (
                <Textarea
                    id={f.name}
                    value={value}
                    onChange={(e) => setField(f.name, e.target.value)}
                    placeholder={f.placeholder}
                    rows={3}
                />
            );
        }
        if (f.type === 'il') {
            return (
                <Select value={value} onValueChange={(v) => setField(f.name, v)}>
                    <SelectTrigger id={f.name} className="w-full">
                        <SelectValue placeholder="İl seçin" />
                    </SelectTrigger>
                    <SelectContent>
                        {ILLER.map((il) => <SelectItem key={il} value={il}>{il}</SelectItem>)}
                    </SelectContent>
                </Select>
            );
        }
        if (f.type === 'ilce') {
            return (
                <Select value={value} onValueChange={(v) => setField(f.name, v)} disabled={!form.il}>
                    <SelectTrigger id={f.name} className="w-full">
                        <SelectValue placeholder={form.il ? 'İlçe seçin' : 'Önce il seçin'} />
                    </SelectTrigger>
                    <SelectContent>
                        {ilceler.map((ilce) => <SelectItem key={ilce} value={ilce}>{ilce}</SelectItem>)}
                    </SelectContent>
                </Select>
            );
        }
        return (
            <Input
                id={f.name}
                type={f.type === 'tel' ? 'tel' : 'text'}
                value={value}
                onChange={(e) => setField(f.name, e.target.value)}
                placeholder={f.placeholder}
            />
        );
    }

    const StepIcon = step.icon;

    return (
        <Dialog open={true}>
            <DialogContent
                showCloseButton={false}
                onInteractOutside={(e) => e.preventDefault()}
                onEscapeKeyDown={(e) => e.preventDefault()}
                className="sm:max-w-lg"
            >
                {/* Karşılama başlığı */}
                <DialogHeader>
                    <DialogTitle
                        className="text-2xl font-light tracking-tight"
                        style={{ fontFamily: 'Marcellus, serif' }}
                    >
                        Hoş geldiniz 👋
                    </DialogTitle>
                    <DialogDescription>
                        Başlamadan önce birkaç bilgiye ihtiyacımız var.
                    </DialogDescription>
                </DialogHeader>

                {/* İlerleme */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                        <span>Adım {stepIndex + 1} / {STEPS.length}</span>
                        <span>%{progress}</span>
                    </div>
                    <Progress value={progress} />
                </div>

                {/* Adım başlığı */}
                <div className="flex items-center gap-3">
                    <div className="flex size-9 items-center justify-center rounded-full bg-[#084529]/10 text-[#084529] dark:text-[#d8c7a3]">
                        <StepIcon className="size-4.5" />
                    </div>
                    <div>
                        <p className="font-semibold leading-tight">{step.title}</p>
                        <p className="text-xs text-muted-foreground">{step.description}</p>
                    </div>
                </div>

                {/* Alanlar */}
                <div className="space-y-4">
                    {step.fields.map((f) => (
                        <div key={f.name} className="space-y-1.5">
                            <Label htmlFor={f.name}>{f.label}</Label>
                            {renderField(f)}
                        </div>
                    ))}
                </div>

                {/* Aksiyonlar */}
                <div className="flex items-center justify-between gap-2 pt-2">
                    <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setStepIndex((i) => i - 1)}
                        disabled={stepIndex === 0 || saving}
                    >
                        <ArrowLeft className="size-4" />
                        Geri
                    </Button>
                    <Button type="button" onClick={ileri} disabled={saving}>
                        {saving ? (
                            <><Spinner className="size-4" /> Kaydediliyor...</>
                        ) : isLast ? (
                            <><Check className="size-4" /> Tamamla</>
                        ) : (
                            <>İleri <ArrowRight className="size-4" /></>
                        )}
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );
}
