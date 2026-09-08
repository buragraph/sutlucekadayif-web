/**
 * Şikayetvar marka sayfasındaki şikayetleri masaya çeker.
 *
 * ELLE ÇALIŞTIRILIR, CRON DEĞİL. Şikayetvar'ın `robots.txt`i marka sayfasına
 * ve `?page` sayfalamasına izin veriyor (yasakladığı yol `/sikayet/detay/`,
 * bizim topladığımız bağlantılar `/sutluce-kadayif/<baslik>` biçiminde) — ama
 * robots kullanım şartlarının yerine geçmez ve markanın orada ücretli bir
 * paneli var. Otomatik/sürekli tarama başlatmadan önce Şikayetvar'dan resmî
 * erişim isteyin. Bu betik, elde veri lazım olduğunda tek seferlik çalıştırmak
 * içindir.
 *
 * Kullanım:
 *   node scripts/gecis/sikayetvar-cek.mjs            # yalnızca RAPOR (yazmaz)
 *   node scripts/gecis/sikayetvar-cek.mjs --yaz      # veritabanına yazar
 *   node scripts/gecis/sikayetvar-cek.mjs --yaz --sayfa 3
 *
 * TEKİLLEŞTİRME veritabanında: (kaynak, kaynak_id) tekil indeksi. kaynak_id
 * olarak şikayetin kalıcı yolu kullanılıyor; aynı kayıt ikinci turda 23505 ile
 * reddedilir, betik onu "zaten var" diye sayar.
 */
import 'dotenv/config';
import { supabase } from '../../config/supabase.js';

const MARKA = 'https://www.sikayetvar.com/sutluce-kadayif';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

const yaz = process.argv.includes('--yaz');
const sayfaSayisi = Number(process.argv[process.argv.indexOf('--sayfa') + 1]) || 3;

const cozHtml = (s) => String(s)
    .replace(/&#x27;|&#39;/g, "'").replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ').trim();

/**
 * Marka sayfasındaki "konu" çiplerini çıkarır.
 *
 * Şikayetvar'ın kendi şube etiketleri bunlar (kayseri talas, aksaray, van...).
 * Başlıktan tahmine göre ÇOK daha güvenilir: şikayetin hangi şubeye ait
 * olduğunu Şikayetvar'ın kendisi söylüyor.
 */
function konulariAyikla(html) {
    const konular = [];
    const re = /title="Sütlüce Kadayıf ([^"]+)" draggable="false" href="(\/sutluce-kadayif\/[^"]+)"/g;
    let m;
    while ((m = re.exec(html)) !== null) konular.push({ ad: cozHtml(m[1]), yol: m[2] });
    return konular;
}

/** Bir liste sayfasındaki şikayet kartlarını çıkarır. */
function kartlariAyikla(html) {
    const kartlar = [];
    // Başlık bloğu: <h3 ...><a ... title="..." href="/sutluce-kadayif/...">
    const re = /<h3 class="font-bold[^"]*"><a class="[^"]*" title="([^"]*)" href="(\/sutluce-kadayif\/[^"]+)"/g;
    let m;
    while ((m = re.exec(html)) !== null) {
        kartlar.push({ baslik: cozHtml(m[1]), yol: m[2] });
    }
    return kartlar;
}

/**
 * Başlıktan şubeyi tahmin eder.
 *
 * Şikayetvar'da şube alanı yok; şube adı başlığın içinde geçiyor
 * ("Aksaray Şubesinde...", "Sütlüce Kadayıf Kars Şubesinde..."). Eşleşme
 * bulunamazsa şube BOŞ bırakılır — yanlış şubeye şikayet yazmak, şubesiz
 * bırakmaktan çok daha kötü.
 */
function subeTahmini(baslik, subeler) {
    const b = baslik.toLocaleLowerCase('tr');
    // En uzun eşleşme kazanır: "Ankara Etimesgut" varken "Ankara"ya düşmesin.
    let enIyi = null;
    for (const s of subeler) {
        const ad = (s.ad || '').toLocaleLowerCase('tr');
        if (ad.length < 3) continue;
        if (b.includes(ad) && (!enIyi || ad.length > enIyi.ad.length)) enIyi = { kod: s.kod, ad };
        // Şube adı "İstanbul Maltepe" ise başlıkta yalnızca "Maltepe" geçiyor olabilir.
        const son = ad.split(' ').slice(-1)[0];
        if (son.length >= 4 && b.includes(son) && (!enIyi || son.length > enIyi.ad.length)) {
            enIyi = { kod: s.kod, ad: son };
        }
    }
    return enIyi?.kod || null;
}

const { data: subeler } = await supabase.from('subeler').select('kod, ad');

const tumKartlar = [];
for (let sayfa = 1; sayfa <= sayfaSayisi; sayfa++) {
    const url = sayfa === 1 ? MARKA : `${MARKA}?page=${sayfa}`;
    const r = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!r.ok) { console.error(`sayfa ${sayfa}: HTTP ${r.status}`); break; }
    const kartlar = kartlariAyikla(await r.text());
    if (kartlar.length === 0) break;                       // sayfalar bitti
    tumKartlar.push(...kartlar);
    console.log(`sayfa ${sayfa}: ${kartlar.length} şikayet`);
    // Kibar tarama: sayfalar arasında bir saniye bekle.
    await new Promise((c) => setTimeout(c, 1000));
}

// Aynı şikayet birden çok sayfada görünebiliyor (öne çıkanlar bloğu).
const tekil = [...new Map(tumKartlar.map((k) => [k.yol, k])).values()];
console.log(`\ntoplam ${tekil.length} tekil şikayet`);

// ── Konu sayfalarından şube eşleştirmesi ────────────────────────────────
// Başlıkta şube adı geçmeyen şikayetler (çoğunluk) ancak buradan bağlanıyor.
const ilkSayfa = await (await fetch(MARKA, { headers: { 'User-Agent': UA } })).text();
const konuSubesi = new Map();       // şikayet yolu → şube kodu
for (const konu of konulariAyikla(ilkSayfa)) {
    const kod = subeTahmini(konu.ad, subeler || []);
    if (!kod) continue;
    const r = await fetch(`https://www.sikayetvar.com${konu.yol}`, { headers: { 'User-Agent': UA } });
    if (!r.ok) continue;
    for (const k of kartlariAyikla(await r.text())) {
        if (!konuSubesi.has(k.yol)) konuSubesi.set(k.yol, kod);
        // Konu sayfasında ana listede olmayan şikayet çıkabilir; onu da al.
        if (!tekil.some((x) => x.yol === k.yol)) tekil.push(k);
    }
    await new Promise((c) => setTimeout(c, 1000));
}
console.log(`${konuSubesi.size} şikayet konu sayfasından şubeye bağlandı`);
console.log(`toplam ${tekil.length} şikayet işlenecek\n`);

let eklendi = 0; let vardi = 0; let hata = 0;
for (const k of tekil) {
    // Konu sayfası > başlık tahmini: ilki Şikayetvar'ın kendi etiketi.
    const subeKod = konuSubesi.get(k.yol) || subeTahmini(k.baslik, subeler || []);
    console.log(`${subeKod ? subeKod.padEnd(22) : '(şube tahmin edilemedi)'.padEnd(22)} ${k.baslik.slice(0, 60)}`);
    if (!yaz) continue;

    const { data: sube } = subeKod
        ? await supabase.from('subeler').select('ad').eq('kod', subeKod).maybeSingle()
        : { data: null };

    const { error } = await supabase.from('geri_bildirimler').insert({
        id: crypto.randomUUID().replace(/-/g, '').slice(0, 20),
        sube_slug: subeKod,
        sube_ad: sube?.ad || null,
        // Şikayetvar'da konu alanı yok; sınıflandırmayı merkez masada yapıyor.
        kategori: 'diger',
        // Kart yalnızca başlık ve kırpılmış özet veriyor; tam metin detay
        // sayfasında. Başlığı mesaj olarak yazıp bağlantıyı bırakıyoruz.
        mesaj: k.baslik,
        kvkk_onay: false,
        durum: 'yeni',
        admin_notu: '',
        kaynak: 'sikayetvar',
        kaynak_url: `https://www.sikayetvar.com${k.yol}`,
        kaynak_id: k.yol,
        olusturma: new Date().toISOString(),
    });
    if (!error) eklendi++;
    else if (error.code === '23505') vardi++;
    else { hata++; console.error('  ✗', error.message); }
}

if (yaz) console.log(`\n${eklendi} eklendi · ${vardi} zaten vardı · ${hata} hata`);
else console.log('\n(RAPOR MODU — hiçbir şey yazılmadı; yazmak için --yaz)');
