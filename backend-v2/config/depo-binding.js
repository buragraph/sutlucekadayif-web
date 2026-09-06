// Workers tarafının depolama uygulaması — wrangler.toml'daki [[r2_buckets]]
// binding'i (DEPO). S3 API'si, imza hesabı ve gizli anahtar YOK: binding
// doğrudan bucket nesnesini veriyor.
//
// worker.js her istekte `depoAyarla(depoBinding(env.DEPO))` çağırır; Workers'ta
// env yalnızca handler içinde erişilebilir olduğu için modül düzeyinde tutulamaz.

export function depoBinding(kova) {
    return {
        async yaz(key, govde, tur) {
            await kova.put(key, govde, { httpMetadata: tur ? { contentType: tur } : undefined });
        },
        async sil(key) {
            await kova.delete(key);
        },
        async oku(key) {
            const nesne = await kova.get(key);
            if (!nesne) return null;
            return {
                govde: new Uint8Array(await nesne.arrayBuffer()),
                tur: nesne.httpMetadata?.contentType ?? null,
                boyut: nesne.size ?? null,
            };
        },
        // bkz. depo-s3.js okuAkis — büyük dosyalar için akış + Range.
        async okuAkis(key, aralik) {
            const eslesme = /^bytes=(\d*)-(\d*)$/.exec(aralik || '');
            let istek;
            if (eslesme) {
                const [, bas, son] = eslesme;
                istek = bas === ''
                    ? { suffix: Number(son) }
                    : { offset: Number(bas), ...(son === '' ? {} : { length: Number(son) - Number(bas) + 1 }) };
            }
            const nesne = await kova.get(key, istek ? { range: istek } : undefined);
            if (!nesne) return null;
            const toplam = nesne.size ?? null;
            const r = nesne.range;
            const bas = r?.offset ?? 0;
            const uzunluk = r?.length ?? toplam;
            return {
                akis: nesne.body,
                tur: nesne.httpMetadata?.contentType ?? null,
                boyut: uzunluk,
                aralikBasligi: istek && toplam != null
                    ? `bytes ${bas}-${bas + uzunluk - 1}/${toplam}`
                    : null,
            };
        },
        async listele(onek) {
            const cikti = [];
            let imlec;
            for (;;) {
                const r = await kova.list({ prefix: onek, cursor: imlec });
                for (const o of r.objects) cikti.push({ key: o.key, boyut: o.size, tarih: o.uploaded ?? null });
                if (!r.truncated) break;
                imlec = r.cursor;
            }
            return cikti;
        },
    };
}
