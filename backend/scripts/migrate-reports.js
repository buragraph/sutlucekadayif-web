/**
 * Migration Script: reports/{subeKod}/meta_data|google_data|budgets → subeler/{subeKod}/donemler/{donem}
 * 
 * Kullanım: node --experimental-modules scripts/migrate-reports.js
 */

import dotenv from 'dotenv';
dotenv.config({ path: '../.env.local' });
dotenv.config(); // .env fallback

import { db } from '../config/firebase.js';

const SKIP_DOCS = new Set(['dashboard_cache', 'settings', 'google_token', 'google_mappings', 'meta_mappings', 'campaign_mappings', 'adset_mappings', 'adsets_cache']);

async function migrate() {
  console.log('🚀 Migration başlıyor...\n');

  // Parent dokümanlar olmayabilir, collectionGroup ile şubeleri keşfet
  const metaSnap = await db.collectionGroup('meta_data').get();
  const googleSnap = await db.collectionGroup('google_data').get();
  const butceSnap = await db.collectionGroup('budgets').get();

  // Şube bazında grupla
  const subeMap = {};

  function ensureSube(subeId) {
    if (!subeMap[subeId]) subeMap[subeId] = { meta: [], google: [], budgets: [] };
    return subeMap[subeId];
  }

  metaSnap.forEach(d => {
    const data = d.data();
    ensureSube(data.sube_id).meta.push(data);
  });
  googleSnap.forEach(d => {
    const data = d.data();
    ensureSube(data.sube_id).google.push(data);
  });
  butceSnap.forEach(d => {
    const data = d.data();
    ensureSube(data.sube_id).budgets.push(data);
  });

  const subeIds = Object.keys(subeMap);
  console.log(`📋 ${subeIds.length} şube bulundu: ${subeIds.join(', ')}\n`);

  let totalDonemler = 0;

  for (const subeKod of subeIds) {
    const subeData = subeMap[subeKod];
    console.log(`\n── ${subeKod} ──`);
    console.log(`   Meta: ${subeData.meta.length} reklam seti`);
    console.log(`   Google: ${subeData.google.length} dönem`);
    console.log(`   Bütçe: ${subeData.budgets.length} dönem`);

    // 1. Meta verilerini dönem bazında grupla ve topla
    const donemMap = {};

    for (const m of subeData.meta) {
      const key = `${m.donem_baslangic}_${m.donem_bitis}`;
      if (!donemMap[key]) {
        donemMap[key] = {
          donem_baslangic: m.donem_baslangic,
          donem_bitis: m.donem_bitis,
          harcama: 0, erisim: 0, gosterim: 0, sonuc: 0,
          tiklama: 0, tiklama_tumu: 0, mesaj: 0, yorum: 0, paylasim: 0,
        };
      }
      const g = donemMap[key];
      g.harcama += (m.harcama || 0);
      g.erisim += (m.erisim || 0);
      g.gosterim += (m.gosterim || 0);
      g.sonuc += (m.sonuc || 0);
      g.tiklama += (m.baglanti_tiklamalari || 0);
      g.tiklama_tumu += (m.tiklamalar_tumu || 0);
      g.mesaj += (m.mesajlasmalar || 0);
      g.yorum += (m.yorumlar || 0);
      g.paylasim += (m.paylasimlar || 0);
    }

    // 2. Google verilerini ekle
    for (const g of subeData.google) {
      const key = `${g.donem_baslangic}_${g.donem_bitis}`;
      if (!donemMap[key]) {
        donemMap[key] = { donem_baslangic: g.donem_baslangic, donem_bitis: g.donem_bitis };
      }
      donemMap[key].google_arama = (g.arama_mobil || 0) + (g.arama_masaustu || 0);
      donemMap[key].google_harita = (g.harita_mobil || 0) + (g.harita_masaustu || 0);
      donemMap[key].google_telefon = g.telefon || 0;
      donemMap[key].google_yol_tarifi = g.yol_tarifi || 0;
      donemMap[key].google_web_tiklama = g.web_tiklama || 0;
      donemMap[key].google_menu_tiklama = g.menu_tiklama || 0;
    }

    // 3. Bütçe verilerini ekle
    for (const b of subeData.budgets) {
      const key = `${b.donem_baslangic}_${b.donem_bitis}`;
      if (!donemMap[key]) {
        donemMap[key] = { donem_baslangic: b.donem_baslangic, donem_bitis: b.donem_bitis };
      }
      donemMap[key].planlanan_butce = b.planlanan_butce || 0;
      donemMap[key].devredilen_miktar = b.devredilen_miktar || 0;
      if (b.toplam_erisim) donemMap[key].erisim = b.toplam_erisim;
      if (b.veri_overrides) donemMap[key].veri_overrides = b.veri_overrides;
    }

    // 4. Yeni yapıya yaz
    const donemler = Object.values(donemMap);
    let toplam_harcama = 0, toplam_erisim = 0, toplam_gosterim = 0, toplam_sonuc = 0, toplam_tiklama = 0;
    let son_donem = null;

    for (const donem of donemler) {
      const docId = `${donem.donem_baslangic}_${donem.donem_bitis}`;
      const docRef = db.collection('subeler').doc(subeKod).collection('donemler').doc(docId);
      await docRef.set({ ...donem, updatedAt: new Date().toISOString() }, { merge: true });

      toplam_harcama += (donem.harcama || 0);
      toplam_erisim += (donem.erisim || 0);
      toplam_gosterim += (donem.gosterim || 0);
      toplam_sonuc += (donem.sonuc || 0);
      toplam_tiklama += (donem.tiklama || 0);

      if (!son_donem || donem.donem_baslangic > son_donem.split('_')[0]) {
        son_donem = docId;
      }
    }

    // 5. Şube aggregate alanlarını güncelle
    await db.collection('subeler').doc(subeKod).set({
      toplam_harcama, toplam_erisim, toplam_gosterim, toplam_sonuc, toplam_tiklama,
      son_donem, donem_sayisi: donemler.length,
    }, { merge: true });

    totalDonemler += donemler.length;
    console.log(`   ✅ ${donemler.length} dönem yazıldı, aggregates güncellendi`);
    console.log(`      harcama: ₺${toplam_harcama.toFixed(2)} | erişim: ${toplam_erisim} | gösterim: ${toplam_gosterim}`);
  }

  console.log(`\n🎉 Migration tamamlandı! Toplam ${totalDonemler} dönem taşındı.`);
  console.log('⚠️  Eski reports/{subeKod} verileri yerinde duruyor. Doğruladıktan sonra silebilirsiniz.');
  process.exit(0);
}

migrate().catch(err => {
  console.error('❌ Migration hatası:', err);
  process.exit(1);
});
