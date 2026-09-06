// Ders video girdisini çözümler: YouTube videosu, YouTube oynatma listesi
// ya da doğrudan bir video DOSYASI (R2'ye yüklenmiş .mp4 gibi).
// VideoPlayer (oynatma), AcademyAdmin (küçük resim) ve LessonEditorSheet
// (doğrulama/önizleme) ortak kullanır.
//
// NEDEN 'file' TÜRÜ VAR: WordPress akademisinden taşınan "Led Ekran Yönetimi"
// dersinin videosu YouTube'da değil, R2'de bir MP4. Eskiden çözümleyici
// tanımadığı her girdiyi "YouTube ID" sayıp geri veriyordu; oynatıcı da onu
// YouTube'a soruyor ve konsol "Invalid video id" ile patlıyor, ders açılmıyordu.
const VIDEO_UZANTI = /\.(mp4|webm|ogg|ogv|m4v|mov)(\?.*)?$/i;

export function parseYouTubeInput(input) {
    if (!input) return { type: null, id: null };

    const metin = String(input).trim();

    // Playlist URL kontrolü
    const playlistMatch = metin.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (playlistMatch) {
        return { type: 'playlist', id: playlistMatch[1] };
    }

    // Zaten sadece ID ise (11 karakter)
    if (/^[a-zA-Z0-9_-]{11}$/.test(metin)) {
        return { type: 'video', id: metin };
    }

    // YouTube URL'sinden video ID çıkar
    const videoPatterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
        // shorts/live linkleri ve youtube-nocookie embed'leri
        /(?:youtube\.com|youtube-nocookie\.com)\/(?:shorts|live|embed|v)\/([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of videoPatterns) {
        const match = metin.match(pattern);
        if (match) {
            return { type: 'video', id: match[1] };
        }
    }

    // Doğrudan video dosyası: uzantıya bakılır. Proxy'den geçmiş R2 linkleri de
    // uzantıyı koruduğu için buraya düşer.
    if (/^https?:\/\//i.test(metin) && VIDEO_UZANTI.test(metin)) {
        return { type: 'file', id: metin };
    }

    // Hiçbiri eşleşmediyse video ID olarak kabul et
    return { type: 'video', id: metin };
}
