// Import scriptlerinin ortak altyapısı: Firestore (okuma) + Supabase (yazma)
// istemcileri, tip dönüşümleri, parçalı upsert ve rapor yardımcıları.
//
// Çalıştırma: cd backend-v2 && node scripts/supabase-import/hepsi.mjs
// Tek koleksiyon: node scripts/supabase-import/04-donemler.mjs
import { V2_KOK } from './env.mjs';

import path from 'node:path';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import admin from 'firebase-admin';
import { supabase } from '../../config/supabase.js';

export { supabase };

// ─── Firestore (eski taraf — YALNIZCA okuma) ───
if (!admin.apps.length) {
    const credYol = path.resolve(
        V2_KOK,
        process.env.GOOGLE_APPLICATION_CREDENTIALS || '../backend/serviceAccountKey.json'
    );
    admin.initializeApp({
        credential: admin.credential.cert(JSON.parse(readFileSync(credYol, 'utf8'))),
    });
}
export const db = admin.firestore();

// ─── Tip dönüşümleri ───

/** Firestore Timestamp | ISO string | null → timestamptz stringi ya da null */
export function zaman(v) {
    if (v == null || v === '') return null;
    if (typeof v?.toDate === 'function') return v.toDate().toISOString();
    if (v instanceof Date) return v.toISOString();
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** 'YYYY-MM-DD' bekler; başka biçim gelirse sessizce geçmek yerine patlar. */
export function tarih(v) {
    if (v == null || v === '') return null;
    const s = String(v).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error(`Beklenmeyen tarih biçimi: ${JSON.stringify(v)}`);
    return s;
}

/** Sayı ya da null — boş string/undefined/NaN hepsi null olur. */
export function sayi(v) {
    if (v == null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

export const metin = (v) => (v == null ? null : String(v));
export const dizi = (v) => (Array.isArray(v) ? v : []);

/**
 * Boş string'i null yapar. FK kolonlarında şart: Firestore'da "şubesi yok"
 * bazen '' ile yazılmış, Postgres bunu geçerli bir anahtar sanıp FK'da patlıyor.
 * Sıradan metin alanlarında KULLANMA — '' ile alanın hiç olmaması arasındaki
 * farkı korumak parite için gerekli.
 */
export const bosNull = (v) => {
    const s = v == null ? null : String(v).trim();
    return s === '' ? null : s;
};

// ─── Yazma ───

/**
 * Parçalara bölerek upsert eder (tekrar çalıştırılabilir).
 * @param {string} tablo
 * @param {object[]} satirlar
 * @param {string} onConflict — çakışma anahtarı, ör. 'urun_id,sube_kod'
 */
export async function upsert(tablo, satirlar, onConflict) {
    const PARCA = 500;
    for (let i = 0; i < satirlar.length; i += PARCA) {
        const parca = satirlar.slice(i, i + PARCA);
        const { error } = await supabase.from(tablo).upsert(parca, { onConflict });
        if (error) {
            throw new Error(`${tablo} upsert hatası (${i}-${i + parca.length}): ${error.message}` +
                (error.details ? ` — ${error.details}` : ''));
        }
    }
    return satirlar.length;
}

/** Tablodaki satır sayısı (RLS baypas — service_role). */
export async function satirSayisi(tablo) {
    const { count, error } = await supabase.from(tablo).select('*', { count: 'exact', head: true });
    if (error) throw new Error(`${tablo} sayım hatası: ${error.message}`);
    return count;
}

// ─── Rapor ───

const YESIL = '\x1b[32m', SARI = '\x1b[33m', GRI = '\x1b[90m', SIFIRLA = '\x1b[0m';

export function rapor(baslik, satirlar) {
    console.log(`${YESIL}✓${SIFIRLA} ${baslik}`);
    for (const [k, v] of Object.entries(satirlar)) {
        const renk = /atlan|uyar|eksik|bilinmeyen/i.test(k) && v ? SARI : GRI;
        console.log(`   ${renk}${k}: ${v}${SIFIRLA}`);
    }
}

export function uyari(mesaj) {
    console.log(`${SARI}⚠ ${mesaj}${SIFIRLA}`);
}

/** Script doğrudan mı çalıştırıldı (import edilmedi mi)? */
export function dogrudanMi(importMetaUrl) {
    return process.argv[1] && importMetaUrl === pathToFileURL(process.argv[1]).href;
}

/** Şube kodları kümesi — FK öncesi doğrulama için. */
export async function subeKodlari() {
    const snap = await db.collection('subeler').select().get();
    return new Set(snap.docs.map((d) => d.id));
}
