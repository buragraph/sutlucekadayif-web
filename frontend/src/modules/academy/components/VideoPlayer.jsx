import { useEffect, useRef, useState, useMemo } from 'react';
import Plyr from 'plyr';
import 'plyr/dist/plyr.css';

// URL'den video veya playlist ID çıkar
function parseYouTubeInput(input) {
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

export default function VideoPlayer({
    videoId,
    onProgress,
    onComplete,
    autoplay = false,
    startTime = 0,
    title = ''
}) {
    const videoRef = useRef(null);
    const iframeRef = useRef(null);
    const playerRef = useRef(null);
    const [isReady, setIsReady] = useState(false);
    const [isPlaying, setIsPlaying] = useState(false);

    const { type: videoType, id: parsedId } = useMemo(() =>
        parseYouTubeInput(videoId), [videoId]
    );

    const isPlaylistMode = videoType === 'playlist';

    useEffect(() => {
        if (!parsedId) return;

        if (isPlaylistMode) {
            if (!window.YT) {
                const tag = document.createElement('script');
                tag.src = 'https://www.youtube.com/iframe_api';
                const firstScriptTag = document.getElementsByTagName('script')[0];
                firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
                window.onYouTubeIframeAPIReady = initYTPlayer;
            } else {
                initYTPlayer();
            }
        } else if (videoRef.current) {
            initPlyrPlayer();
        }

        return () => {
            if (playerRef.current) {
                if (isPlaylistMode) {
                    playerRef.current.destroy?.();
                } else {
                    playerRef.current.destroy();
                }
            }
        };
    }, [parsedId, isPlaylistMode]);

    const initYTPlayer = () => {
        if (!iframeRef.current) return;

        playerRef.current = new window.YT.Player(iframeRef.current, {
            playerVars: {
                list: parsedId,
                listType: 'playlist',
                rel: 0,
                modestbranding: 1,
                iv_load_policy: 3,
                showinfo: 0,
                controls: 1,
                playsinline: 1,
                origin: window.location.origin,
            },
            events: {
                onReady: () => {
                    setIsReady(true);
                    if (startTime > 0) {
                        playerRef.current.seekTo(startTime, true);
                    }
                },
                onStateChange: (event) => {
                    if (event.data === 1) setIsPlaying(true);
                    else if (event.data === 2) setIsPlaying(false);
                    else if (event.data === 0) {
                        setIsPlaying(false);
                        if (onComplete) onComplete();
                    }
                }
            }
        });
    };

    const initPlyrPlayer = () => {
        playerRef.current = new Plyr(videoRef.current, {
            controls: [
                'play-large', 'play', 'progress', 'current-time',
                'duration', 'mute', 'volume', 'settings', 'fullscreen'
            ],
            youtube: {
                noCookie: true,
                rel: 0,
                showinfo: 0,
                iv_load_policy: 3,
                modestbranding: 1,
                playsinline: 1,
                origin: window.location.origin,
                fs: 0,
                disablekb: 1,
                cc_load_policy: 0,
                controls: 0,
                autoplay: 0,
                mute: 0,
            },
            hideControls: true,
            clickToPlay: true,
            disableContextMenu: true,
            autoplay: autoplay,
            seekTime: 10,
            keyboard: { focused: true, global: false },
            tooltips: { controls: true, seek: true },
            i18n: {
                restart: 'Yeniden Başlat',
                play: 'Oynat',
                pause: 'Duraklat',
                fastForward: 'İleri Sar',
                rewind: 'Geri Sar',
                seek: 'Ara',
                seekLabel: '{currentTime} / {duration}',
                played: 'Oynatıldı',
                buffered: 'Yüklendi',
                currentTime: 'Şimdiki Zaman',
                duration: 'Süre',
                volume: 'Ses',
                mute: 'Sesi Kapat',
                unmute: 'Sesi Aç',
                enableCaptions: 'Altyazıları Aç',
                disableCaptions: 'Altyazıları Kapat',
                enterFullscreen: 'Tam Ekran',
                exitFullscreen: 'Tam Ekrandan Çık',
                frameTitle: 'Video Oynatıcı',
                captions: 'Altyazılar',
                settings: 'Ayarlar',
                speed: 'Hız',
                normal: 'Normal',
                quality: 'Kalite',
                loop: 'Döngü'
            }
        });

        playerRef.current.on('ready', () => {
            setIsReady(true);
            if (startTime > 0) {
                playerRef.current.currentTime = startTime;
            }
        });

        playerRef.current.on('playing', () => setIsPlaying(true));
        playerRef.current.on('pause', () => setIsPlaying(false));
        playerRef.current.on('ended', () => {
            setIsPlaying(false);
            if (onComplete) onComplete();
        });
    };

    if (isPlaylistMode) {
        return (
            <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden', borderRadius: '0.75rem' }}>
                <div ref={iframeRef} id="youtube-playlist-player" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} />
            </div>
        );
    }

    return (
        <div style={{ position: 'relative' }} className="plyr-container">
            <div
                ref={videoRef}
                data-plyr-provider="youtube"
                data-plyr-embed-id={parsedId}
            />
        </div>
    );
}
