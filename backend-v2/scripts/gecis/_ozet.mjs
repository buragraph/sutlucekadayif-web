import 'dotenv/config';
import { supabase } from '../../config/supabase.js';
const D = { b: '2026-07-23', s: '2026-08-21' };
const { data } = await supabase.from('donemler')
    .select('sube_kod, harcama, google_arama, guncelleme')
    .eq('baslangic', D.b).eq('bitis', D.s).range(0, 9999);
const bugun = data.filter((d) => (d.guncelleme || '').startsWith('2026-09-07'));
console.log(`dönem ${D.b}→${D.s}: ${data.length} satır | bugün güncellenen: ${bugun.length}`);
console.log(`  Meta (harcama dolu)   : ${data.filter((d) => d.harcama != null).length}`);
console.log(`  Google (arama dolu)   : ${data.filter((d) => d.google_arama != null).length}`);
