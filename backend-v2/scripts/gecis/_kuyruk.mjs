import 'dotenv/config';
import { supabase } from '../../config/supabase.js';
const { data } = await supabase.from('ayarlar').select('deger, guncelleme').eq('anahtar', 'cekim_kuyrugu').maybeSingle();
const isler = data?.deger?.isler || [];
const toplam = isler.reduce((t, x) => t + x.kodlar.length, 0);
console.log(`kuyruk: ${isler.length} dönem, ${toplam} şube | son yazım: ${(data?.guncelleme||'—').slice(0,19)}`);
isler.forEach((i) => console.log(`  ${i.since}→${i.until}: ${i.kodlar.length} şube  [${i.kodlar.slice(0,6).join(', ')}${i.kodlar.length>6?', …':''}]`));
