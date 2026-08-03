// Dosya yükleme middleware'i — ortam bağımsız (Faz 3 / C1).
//
// Node/Functions: multer (memoryStorage) — server.js kaydeder.
// Workers: gövde zaten shared/router.js içinde `request.formData()` ile
//   çözülüp req.file/req.files'a konuyor; burada yalnızca tip/boyut kuralı
//   uygulanır. multer paketi Worker paketine hiç girmez.
//
// Kurallar (izinli MIME listesi, boyut sınırı) TEK yerde: çağıran rota bunları
// seçenek olarak veriyor, iki ortam da aynı kuralı uyguluyor.

let uygulama = null;
const onbellek = new Map();   // "alan|ayar" → middleware

/** Giriş noktası bir uygulama kaydeder (server.js → multer, worker.js → yerleşik). */
export function dosyaAyarla(u) { uygulama = u; onbellek.clear(); }

/**
 * @param {string} alan — form alan adı ('image', 'file', 'csv', 'dekont')
 * @param {{tipler?: string[], enBoy?: number, hataMesaji?: string}} [ayar]
 * @returns {Function} (req, res, next) middleware
 */
export function dosyaAl(alan, ayar = {}) {
    const anahtar = alan + '|' + JSON.stringify(ayar);
    return (req, res, next) => {
        if (!uygulama) return next(new Error('Dosya katmanı kayıtlı değil — giriş noktasında dosyaAyarla() çağrılmalı'));
        let mw = onbellek.get(anahtar);
        if (!mw) { mw = uygulama(alan, ayar); onbellek.set(anahtar, mw); }
        return mw(req, res, next);
    };
}

/** Workers tarafı: gövde çözülmüş durumda, yalnızca doğrula. */
export function dosyaYerlesik(alan, { tipler, uzantilar, enBoy, hataMesaji } = {}) {
    return (req, res, next) => {
        const d = (req.files || []).find((f) => f.fieldname === alan) || null;
        req.file = d;
        if (d) {
            if (tipler && !tipler.includes(d.mimetype)) {
                return next(new Error(hataMesaji || 'Dosya türü kabul edilmiyor'));
            }
            if (uzantilar) {
                const uz = '.' + String(d.originalname || '').split('.').pop().toLowerCase();
                if (!uzantilar.includes(uz)) return next(new Error(hataMesaji || 'Dosya türü kabul edilmiyor'));
            }
            if (enBoy && d.size > enBoy) {
                return next(new Error('Dosya boyutu sınırı aşıldı'));
            }
        }
        next();
    };
}
