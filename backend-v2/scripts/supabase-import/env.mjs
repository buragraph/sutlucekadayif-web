// backend-v2/.env'i MUTLAK yolla yükler — scriptler hangi dizinden çalıştırılırsa
// çalıştırılsın aynı ayarları görsün. ESM'de import'lar gövdeden önce koştuğu için
// bu dosya ortak.mjs'in İLK import'u olmalı (supabase istemcisi env'i okumadan önce).
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const buDizin = path.dirname(fileURLToPath(import.meta.url));
export const V2_KOK = path.resolve(buDizin, '../..');

dotenv.config({ path: path.join(V2_KOK, '.env.local') });   // lokal override
dotenv.config({ path: path.join(V2_KOK, '.env') });
