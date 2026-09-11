-- Şikayet masası ikiye ayrıldı: müşteri şikayetleri ve ŞUBE şikayetleri.
--
-- NEDEN AYNI TABLO: iki kayıt türü de aynı şeylere ihtiyaç duyuyor — şube,
-- konu, durum akışı, dahili not ve mesaj geçmişi (geri_bildirim_mesajlari
-- bildirim_id ile bağlı). Ayrı tablo açmak bu altyapının tamamını ikizlerdi.
-- Ayrım tek kolonda: `tip`.
--
-- YÖN FARKI: müşteri şikayeti ŞUBE HAKKINDA (dışarıdan gelir, merkez ve şube
-- birlikte kapatır), şube şikayeti ŞUBEDEN MERKEZE (şube açar, yalnızca merkez
-- ilerletir). Durum kümeleri de bu yüzden farklı — şube tarafında "çözüldü"
-- yerine "dönüt sağlandı" var: merkez cevap verdi ama iş bitmemiş olabilir.
--
-- VARSAYILAN 'musteri': tablodaki 22 mevcut kaydın tamamı müşteri şikayeti,
-- geri doldurma gerekmiyor.
alter table public.geri_bildirimler
    add column if not exists tip text not null default 'musteri';

alter table public.geri_bildirimler
    drop constraint if exists geri_bildirimler_tip_check;
alter table public.geri_bildirimler
    add constraint geri_bildirimler_tip_check check (tip in ('musteri', 'sube'));

-- Liste sorgusu artık her zaman tip'e göre süzülüyor.
create index if not exists geri_bildirimler_tip_idx
    on public.geri_bildirimler (tip, olusturma desc);
