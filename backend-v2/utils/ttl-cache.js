// node-cache yerine ortam bağımsız küçük TTL cache (Faz 3 / C1).
//
// node-cache Node'a özgü (timer tabanlı checkperiod) ve Workers'ta gereksiz:
// isolate zaten kısa ömürlü. Kullanılan yüzey ölçüldü — get/set/del/keys/flushAll —
// ve birebir aynısı burada. Süresi geçen kayıt OKUMA anında düşürülür; ayrıca
// her yazımda ucuz bir budama yapılır, böylece arka plan zamanlayıcısı gerekmez.

export default class TtlCache {
    /** @param {{stdTTL?: number}} [ayar] stdTTL saniye cinsinden (node-cache ile aynı) */
    constructor({ stdTTL = 0 } = {}) {
        this.varsayilanTtl = stdTTL;
        this.harita = new Map();   // anahtar → { deger, sonGecerlilik }
    }

    #gecerliMi(kayit) {
        return !kayit.sonGecerlilik || kayit.sonGecerlilik > Date.now();
    }

    #buda() {
        const simdi = Date.now();
        for (const [k, v] of this.harita) {
            if (v.sonGecerlilik && v.sonGecerlilik <= simdi) this.harita.delete(k);
        }
    }

    get(anahtar) {
        const kayit = this.harita.get(anahtar);
        if (!kayit) return undefined;
        if (!this.#gecerliMi(kayit)) { this.harita.delete(anahtar); return undefined; }
        return kayit.deger;
    }

    set(anahtar, deger, ttl = this.varsayilanTtl) {
        this.#buda();
        this.harita.set(anahtar, {
            deger,
            sonGecerlilik: ttl > 0 ? Date.now() + ttl * 1000 : 0,
        });
        return true;
    }

    del(anahtar) {
        const anahtarlar = Array.isArray(anahtar) ? anahtar : [anahtar];
        let silinen = 0;
        for (const a of anahtarlar) if (this.harita.delete(a)) silinen++;
        return silinen;
    }

    keys() {
        this.#buda();
        return [...this.harita.keys()];
    }

    flushAll() {
        this.harita.clear();
    }
}
