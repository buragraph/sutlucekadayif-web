# Fiyat listesi çıktısı — dışarıdan gelen çizim motoru

Şubenin masaya/vitrine koyduğu A4 fiyat listesini üreten kod. Çizim ve dışa
aktarma **bizim yazdığımız kod değil**: "Sütlüce Fiyat Listesi Yönetimi"
uygulamasının **v40** kaynak paketinden olduğu gibi alındı.

- Kaynak commit: `1d0b478df2ed0cd117706b053bf6d06657235a51`
- Paket: `Sutluce-Fiyat-Listesi-Kaynak-Kod-v40.zip` (8 Eylül 2026)

## Dosyalar

| Dosya | Durum |
| --- | --- |
| `menu-svg.tsx` | **Kaynaktan birebir.** 7 çıktı ölçüsünün SVG yerleşim motoru. Dokunma. |
| `export-utils.ts` | **Kaynaktan birebir.** SVG → PNG/JPEG/PDF/ZIP. Bağımlılığı yok, PDF'i elle kuruyor. Dokunma. |
| `data.ts` | Bizim yazdığımız uyum katmanı. Motorun beklediği tipler + kategori sırası. |
| `FiyatListesiPenceresi.jsx` | Bizim pencere: menü verimizi motorun ürün şekline çevirir, önizler, indirir. |
| `fiyat-listesi.css` | Önizleme için `@font-face` (Mondia) ve kap stilleri. |

`public/fonts/mondia-*.otf` ve `public/sutluce-logo.svg` de aynı paketten geldi.

**Neden `.tsx` bıraktık:** Vite bu dosyaları zaten derliyor. JS'e çevirseydik
arkadaşların yeni sürümü geldiğinde diff tutmazdı; şimdi yeni sürümde bu iki
dosyayı üzerine kopyalamak yetiyor.

## Uyum katmanının yaptığı tek şey

Kaynak uygulama kendi kataloğunu, şube listesini ve `localStorage`'ını taşıyor;
bizde bunların karşılığı zaten var (`urunler`, `kategoriler`, `urun_sube`).
Bu yüzden kaynak `data.ts` (342 satır) alınmadı, yerine motorun ihtiyaç
duyduğu asgari yüzey yazıldı:

- `Product` / `CategoryType` tipleri
- `hasProductPrice`
- `categoryOrder` — kaynakta koda gömülüydü, bizde `kategoriler.sira`dan
  geliyor; çizimden önce `kategoriSirasiniAyarla()` ile doldurulur.

## Basılan liste

Müşteriye görünen menünün aynısı: şubenin menüsündeki ürünler, "mevcut değil"
işaretliler hariç, **şubenin geçerli fiyatıyla** (kendi fiyatı varsa o, yoksa
merkezinki). Ayrı bir seçim ekranı yok — kâğıt ile QR menü ayrışmasın.

## Henüz alınmayanlar

- **LED, pleksi ve A5 ölçüleri.** Motor destekliyor (`formats` dizisi), ama bu
  ölçüler ürünleri "tatlı / diğer" diye ikiye ayırıyor; bizim kategorilerde
  böyle bir alan yok. Eklenirse `kategoriler`e bir `cikti_grubu` kolonu gerekir.
- **Kilogram fiyatı.** Kaynakta ikinci bir fiyat sütunu var; bizde ürünün
  `miktar`/`birim` alanları var ama ayrı kg fiyatı yok.
- **Ürün seçme ekranı.** Kaynakta şube listeye hangi ürünün gireceğini tek tek
  işaretliyor. Bizde menünün kendisi zaten bu seçim.
