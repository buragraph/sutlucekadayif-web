// URL'den YouTube video veya playlist ID çıkarır.
// VideoPlayer (oynatma) ve LessonEditorSheet (doğrulama/önizleme) ortak kullanır.
export function parseYouTubeInput(input) {
    if (!input) return { type: null, id: null };

    // Playlist URL kontrolü
    const playlistMatch = input.match(/[?&]list=([a-zA-Z0-9_-]+)/);
    if (playlistMatch) {
        return { type: 'playlist', id: playlistMatch[1] };
    }

    // Zaten sadece ID ise (11 karakter)
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
        return { type: 'video', id: input };
    }

    // YouTube URL'sinden video ID çıkar
    const videoPatterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
        // shorts/live linkleri ve youtube-nocookie embed'leri
        /(?:youtube\.com|youtube-nocookie\.com)\/(?:shorts|live|embed|v)\/([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of videoPatterns) {
        const match = input.match(pattern);
        if (match) {
            return { type: 'video', id: match[1] };
        }
    }

    // Hiçbiri eşleşmediyse video ID olarak kabul et
    return { type: 'video', id: input };
}
