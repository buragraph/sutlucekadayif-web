import { Pencil, Trash2, ListMinus } from 'lucide-react';
import { fiyatYaz } from '../utils/fiyat';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { proxyImageUrl } from '../../../utils/imageProxy';
import { ETIKETLER } from '../constants/etiketler';

/**
 * Şube sahibinin ürün kartı — admin listesinin grid karşılığı.
 *
 * NEDEN SADECE ŞUBEDE: Admin ekranı katalog yönetimi (sıralama, toplu seçim,
 * "kaç şubede açık", tarih) — bunlar sütun ister, kart taşıyamaz. Şube sahibinin
 * yaptığı tek iş "bu ürünü satıyor muyum, fiyatı ne": görsel + ad + fiyat +
 * anahtar. Kart bu işe listeden daha uygun.
 *
 * Mevcut değilken kart soluklaşır AMA anahtar soluklaşmaz — asıl kontrol o,
 * kapalıyken de net okunmalı (liste görünümündeki davranışın aynısı).
 */
export default function UrunKarti({
    urun, mevcut, kilitli, bekliyor,
    onMevcutDegistir, onDuzenle, onFiyat, onMenudenCikar, onSil,
}) {
    const etiketler = (urun.etiket || []).map((k) => ETIKETLER.find((t) => t.key === k)).filter(Boolean);
    const GORUNEN = 2;
    const kalan = etiketler.length - GORUNEN;
    const fiyat = fiyatYaz(urun.etkinFiyat ?? urun.fiyat);
    const merkezFarkli = urun.etkinFiyat != null && urun.etkinFiyat !== urun.fiyat;

    return (
        <div
            className={`group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-colors ${
                kilitli ? '' : 'cursor-pointer hover:border-foreground/30'
            }`}
            onClick={(e) => {
                if (e.target.closest('button') || e.target.closest('[role=switch]')) return;
                if (!kilitli) onDuzenle(urun);
            }}
        >
            {/* Fotoğraf temiz: durum rozeti eskiden görselin üstünde tam
                genişlikte bir şeritti, 30+ kartta beyaz/kırmızı bant duvarı
                oluşturuyor ve yemek fotoğrafını kapatıyordu. Rozet kart gövdesine
                indi; görsel yalnızca soluklaşarak durumu destekliyor. */}
            <div className="relative aspect-[4/3] shrink-0 bg-muted/50">
                {urun.gorsel
                    ? <img src={proxyImageUrl(urun.gorsel)} alt={urun.ad}
                           className={`absolute inset-0 size-full object-cover ${mevcut ? '' : 'opacity-35'}`} loading="lazy" />
                    : <div className={`absolute inset-0 flex size-full items-center justify-center text-3xl text-muted-foreground/40 ${mevcut ? '' : 'opacity-35'}`}>🍮</div>}
            </div>

            <div className={`flex min-w-0 flex-1 flex-col gap-1 p-2.5 ${mevcut ? '' : 'opacity-50'}`}>
                <span className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">{urun.ad}</span>

                {etiketler.length > 0 && (
                    <div className="flex flex-wrap gap-1">
                        {etiketler.slice(0, GORUNEN).map((t) => (
                            <span key={t.key} className="whitespace-nowrap rounded-full px-1.5 py-px text-[10px] font-semibold"
                                  style={{ background: t.color + '18', color: t.color }}>
                                {t.emoji} {t.kisa}
                            </span>
                        ))}
                        {kalan > 0 && (
                            <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-muted-foreground"
                                  title={etiketler.map((t) => t.ad).join(', ')}>
                                +{kalan}
                            </span>
                        )}
                    </div>
                )}

                <div className="mt-auto flex items-end justify-between gap-1 pt-0.5">
                    <div className="min-w-0">
                        <span className="text-[13px] font-medium tabular-nums text-foreground">{fiyat} ₺</span>
                        {urun.miktar ? <span className="ml-0.5 text-[10px] text-muted-foreground">/ {urun.miktar}{urun.birim}</span> : null}
                        {merkezFarkli && (
                            <div className="text-[10px] text-muted-foreground">merkez {fiyatYaz(urun.fiyat)} ₺</div>
                        )}
                    </div>

                    {/* Silme şube sahibinde zaten hiç çıkmıyor (ortak ürün kilitli);
                        yer kaplamasın diye üzerine gelince beliriyor. */}
                    {!kilitli && onSil && (
                        <div className="flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 [@media(hover:none)]:opacity-100">
                            <Button variant="ghost" size="icon" className="size-6 text-destructive hover:bg-destructive/10 hover:text-destructive"
                                    title="Sil" onClick={() => onSil(urun)}>
                                <Trash2 className="size-3.5" />
                            </Button>
                        </div>
                    )}
                </div>
            </div>

            {/* Durum satırı: yazı solda, anahtar sağda. Kart gövdesinde olduğu
                için fotoğrafı kapatmıyor ve kapalı üründe soluklaşmıyor. */}
            {onMevcutDegistir && (
                <div
                    className="flex items-center justify-between gap-1 border-t px-2.5 py-1"
                    onClick={(e) => e.stopPropagation()}
                >
                    <span className={`text-[11px] font-medium ${mevcut ? 'text-foreground' : 'text-destructive'}`}>
                        {mevcut ? 'Satışta' : 'Mevcut değil'}
                    </span>
                    <Switch
                        className="scale-75"
                        checked={mevcut}
                        onCheckedChange={(v) => onMevcutDegistir(urun, v)}
                        disabled={bekliyor}
                        aria-label={`${urun.ad} — ${mevcut ? 'satışta' : 'mevcut değil'}`}
                    />
                </div>
            )}

            {/* Fiyat düzenleme de yazıyla: kalem ikonu neyi değiştirdiğini
                söylemiyordu. Yalnızca merkezin izin verdiği ürünlerde çıkar
                (bkz. fiyat_serbest) — merkez fiyatlı üründe hiç görünmez. */}
            {onFiyat && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onFiyat(urun); }}
                    className="flex w-full items-center justify-center gap-1 border-t py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                    <Pencil className="size-3" /> Fiyat değiştir
                </button>
            )}

            {/* "Menüden çıkar" HER ZAMAN görünür ve yazılı: ikon tek başına ne
                yaptığını anlatmıyordu, üstelik üzerine gelmeden çıkmadığı için
                dokunmatikte bulunması zordu. Kartın altında tam genişlikte,
                ince bir şerit — yükseklik maliyeti düşük. */}
            {onMenudenCikar && (
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onMenudenCikar(urun); }}
                    className="flex w-full items-center justify-center gap-1 border-t py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                    <ListMinus className="size-3" /> Menüden çıkar
                </button>
            )}
        </div>
    );
}
