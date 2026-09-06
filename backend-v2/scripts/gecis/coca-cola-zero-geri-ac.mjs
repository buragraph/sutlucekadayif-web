/**
 * Coca Cola Zero'yu, birleştirmede kaybettiği 39 şubede geri açar.
 *
 * NEDEN: Ağustos içecek birleştirmesinde iki "Coca Cola Zero" kaydından YANLIŞ
 * olanı hayatta bırakılmış — canlı kayıt yalnızca 2 şubedeydi, silinmiş ikiz 39
 * şubeye bağlıydı. Ölü satırlar katalog-olu-kayit-onarim.mjs ile temizlenirken
 * TSV'ye yedeklenmişti; bu betik o yedeği okuyup satırları canlı ürüne taşır.
 *
 * BAYRAKLAR VE fiyat_override AYNEN KORUNUR: amaç "yeniden açmak" değil, kaybolan
 * durumu geri koymak. 9 şubede 75 ₺ override vardı (merkez Cola fiyatı); onlar da
 * korunuyor — silinmeden önceki müşteri fiyatı birebir aynı kalsın diye.
 *
 * Kullanım: node scripts/gecis/coca-cola-zero-geri-ac.mjs <yedek.tsv> [--uygula]
 */
import 'dotenv/config';
import fs from 'node:fs';
import { supabase } from '../../config/supabase.js';
import { depoAyarla } from '../../config/r2.js';
import { depoS3 } from '../../config/depo-s3.js';
import { regenerateMenuJsons } from '../../modules/qr-menu/services/menu-cache.js';

depoAyarla(depoS3);

const [dosya, ...bayraklar] = process.argv.slice(2);
const UYGULA = bayraklar.includes('--uygula');
if (!dosya) { console.error('Kullanım: node coca-cola-zero-geri-ac.mjs <yedek.tsv> [--uygula]'); process.exit(1); }

const CANLI = 'kQ7mTdVxRnZ2LpAeWc4B';   // Coca Cola Zero (canlı)
const OLU = 'EmEjoC66W8AWNCjjMd9v';     // Coca Cola Zero (birleştirmede silinen)

const [baslik, ...satirlar] = fs.readFileSync(dosya, 'utf8').trim().split('\n');
const kolon = baslik.split('\t');
const kayitlar = satirlar.map((s) => Object.fromEntries(s.split('\t').map((v, i) => [kolon[i], v])))
    .filter((r) => r.urun_id === OLU);

const { data: urun } = await supabase.from('urunler').select('ad, fiyat, silinme').eq('id', CANLI).single();
if (urun.silinme) throw new Error('hedef ürün silinmiş — yanlış id');

const { data: subeler } = await supabase.from('subeler').select('kod');
const gecerliSube = new Set(subeler.map((s) => s.kod));
const eksikSube = kayitlar.filter((r) => !gecerliSube.has(r.sube_kod));

const { data: mevcut } = await supabase.from('urun_sube')
    .select('sube_kod, menude, gizli, mevcut_degil').eq('urun_id', CANLI);
const mevcutHarita = new Map((mevcut ?? []).map((r) => [r.sube_kod, r]));
const acilacak = kayitlar.filter((r) => gecerliSube.has(r.sube_kod))
    .filter((r) => { const m = mevcutHarita.get(r.sube_kod); return !(m && m.menude && !m.gizli && !m.mevcut_degil); });

const overrideli = acilacak.filter((r) => r.fiyat_override !== '');
console.log('— Plan —');
console.log(`  ürün: "${urun.ad}" (merkez ${Math.round(urun.fiyat)} ₺), şu an ${mevcutHarita.size} şubede kayıtlı`);
console.log(`  yedekteki satır: ${kayitlar.length} | açılacak: ${acilacak.length} | zaten açık: ${kayitlar.length - acilacak.length - eksikSube.length}`);
if (overrideli.length) console.log(`  fiyat_override taşınacak: ${overrideli.length} şube (${[...new Set(overrideli.map((r) => r.fiyat_override))].join(', ')} ₺)`);
if (eksikSube.length) console.log(`  UYARI şube bulunamadı: ${eksikSube.map((r) => r.sube_kod).join(', ')}`);

if (!UYGULA) { console.log('\n(kuru çalıştırma — hiçbir şey yazılmadı; --uygula ekle)'); process.exit(0); }
if (!acilacak.length) { console.log('\nYapacak bir şey yok.'); process.exit(0); }

const { error } = await supabase.from('urun_sube').upsert(
    acilacak.map((r) => ({
        urun_id: CANLI, sube_kod: r.sube_kod,
        menude: r.menude === 'true', gizli: r.gizli === 'true', mevcut_degil: r.mevcut_degil === 'true',
        fiyat_override: r.fiyat_override === '' ? null : Number(r.fiyat_override),
    })),
    { onConflict: 'urun_id,sube_kod' }
);
if (error) throw new Error(`yazılamadı: ${error.message}`);
console.log(`  ✓ ${acilacak.length} şubede açıldı`);

const etkilenen = acilacak.map((r) => r.sube_kod);
console.log(`  menü yenileniyor: ${etkilenen.length} şube…`);
await regenerateMenuJsons(etkilenen);
console.log('\nBitti.');
