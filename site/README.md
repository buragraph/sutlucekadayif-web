# Sütlüce Kadayıf — Tanıtım Sitesi (Astro)

Mevcut `sutlucekadayif.com` (WordPress/Elementor) sitesinin **Astro** ile lokal
yeniden yapımı. Statik site; hedef dağıtım **Cloudflare Pages**. Backend/CMS ayrı
(Firebase Functions + `cms.sutlucekadayif.com`).

## Çalıştırma

```bash
cd site
npm install
npm run dev      # http://localhost:4321
npm run build    # dist/ üretir (Cloudflare Pages çıktısı)
npm run preview  # build çıktısını lokal servis eder
```

## Yapı

- `src/layouts/Layout.astro` — ortak iskelet (head, fontlar, Header, Footer)
- `src/components/{Header,Footer}.astro` — navigasyon + alt bilgi
- `src/pages/` — sayfalar: `index`, `urunlerimiz`, `hakkimizda`, `franchise`,
  `lezzet-duraklarimiz`, `kullanim-kosullari`, `gizlilik-politikasi`
- `src/styles/global.css` — Tailwind v4 + marka tema tokenları
- `public/img/` — marka görselleri (logo, hero, ürün fotoğrafları, konsept)

## Marka teması (canlı siteden çıkarıldı)

| Token | Değer | Kullanım |
|-------|-------|----------|
| `cream` | `#f0edea` | sayfa arka planı |
| `ink` | `#111010` | başlık metni |
| `body` | `#5d5d5d` | gövde metni |
| `brand` | `#084529` | koyu yeşil, buton/vurgu |
| `lime` | `#8cc63f` | logo "kadayıf" yeşili |
| Fontlar | Marcellus (başlık) + Montserrat (gövde) | Google Fonts |

## Sonraki adımlar (henüz yapılmadı — "onlara sonra bakarız")

- **Franchise formu → CMS bağlama:** form şu an istemci tarafı; `POST /api/basvuru`
  endpoint'i + `basvurular` koleksiyonu + e-posta bildirimi sonraki fazda.
- **Lezzet Durakları:** Elfsight store-locator embed'i yerleştirilecek (yer tutucu var).
- **Yasal sayfalar:** Kullanım Koşulları / Gizlilik Politikası metinleri aktarılacak.
- **Deploy:** Cloudflare Pages + DNS geçişi.
