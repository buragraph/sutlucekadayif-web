---
name: sast-scan
description: >-
  Bu kod tabanında güvenlik açığı taraması (SAST) çalıştırır. Üç aşamalı iş
  akışını yönetir: (1) sast-analysis ile mimari/tehdit modeli çıkarımı,
  (2) 14 açık sınıfını paralel alt-ajanlarla tespit, (3) sast-report ile
  önem sırasına göre birleşik rapor. Kullanıcı "güvenlik taraması yap",
  "açıkları bul", "run vulnerability scan" veya "/sast-scan" dediğinde çalışır.
  utkusen/sast-skills toolkit'inin orkestrasyonudur.
---

# SAST Güvenlik Değerlendirmesi

Amaç: mevcut çalışma dizinindeki kod tabanında güvenlik açıklarını bulmak.
Tüm çıktılar `sast/` klasörüne yazılır (bu klasör `.gitignore`'dadır).

## Adım 1: Kod Tabanı Analizi & Tehdit Modeli

`sast/architecture.md` zaten varsa bu adımı atla. Yoksa `sast-analysis`
skill'ini **oturum içinde doğrudan** çalıştır (sonraki adımlar bu çıktıyı okur).
Bu adım bitmeden ilerleme.

## Adım 2: Açık Tespiti (Paralel)

Çıktı dosyası zaten var olan her kontrolü atla. Her kontrol için **birer alt-ajan**
başlat, hepsi **paralel**. Her alt-ajana şu kalıbı ver:

> Bağlam için `sast/architecture.md` oku, ardından belirtilen SAST skill'ini
> çalıştır. Tüm bulguları o skill'in sonuç dosyasına yaz. O skill'e ait ara
> recon/tehdit dosyalarını bitince temizle.

| Skill | Sonuç dosyası |
|-------|----------------|
| sast-idor | `sast/idor-results.md` |
| sast-sqli | `sast/sqli-results.md` |
| sast-ssrf | `sast/ssrf-results.md` |
| sast-xss | `sast/xss-results.md` |
| sast-rce | `sast/rce-results.md` |
| sast-xxe | `sast/xxe-results.md` |
| sast-fileupload | `sast/fileupload-results.md` |
| sast-pathtraversal | `sast/pathtraversal-results.md` |
| sast-ssti | `sast/ssti-results.md` |
| sast-jwt | `sast/jwt-results.md` |
| sast-missingauth | `sast/missingauth-results.md` |
| sast-businesslogic | `sast/businesslogic-results.md` |
| sast-graphql | `sast/graphql-results.md` |
| sast-hardcodedsecrets | `sast/hardcodedsecrets-results.md` |

Tüm alt-ajanlar bitmeden Adım 3'e geçme.

## Adım 3: Rapor Üretimi

`sast/final-report.md` zaten varsa atla. Tek alt-ajan başlat:

> Tüm `sast/*-results.md` dosyalarını ve bağlam için `sast/architecture.md`
> oku, ardından `sast-report` skill'ini çalıştırıp bulguları önem ve gizlilik
> etkisine göre sıralayan `sast/final-report.md` raporunu üret.

## Not

Bu proje Firestore + Express + React kullanır (SQL/XXE/GraphQL/SSTI muhtemelen
ilgisiz çıkar — yine de çalıştır, "uygulanamaz" sonucu da bilgidir). Meta/Google
API çağrıları SSRF, dekont/medya yüklemeleri file-upload/path-traversal,
`requirePermission` zinciri missing-auth, `veri_overrides`/bütçe akışı
business-logic açısından en verimli hedeflerdir.
