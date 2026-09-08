import { useEffect, useRef, useState } from 'react';
import { FileText, Download, ExternalLink, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { proxyR2Url } from '../../../utils/imageProxy';
import { parcaYukle } from '../../../shared/utils/parca-yukle';
import { Spinner } from '@/components/ui/spinner';

/**
 * PDF görüntüleyici — sayfa sayfa, pdf.js ile.
 *
 * NEDEN TARAYICININ KENDİ GÖRÜNTÜLEYİCİSİ DEĞİL: önceki sürüm belgeyi
 * `<object>` içinde gösteriyordu. O eklenti kapalı bir kutu; kaçıncı sayfada
 * olunduğunu dışarı vermiyor. Ders "sonuna gelince tamamlanabilsin" kuralı
 * bu yüzden kurulamıyordu — kişi ilk sayfadayken "Dersi Tamamla" diyebiliyordu.
 * Kendi sayfalayıcımızla hangi sayfanın açıldığı biliniyor.
 *
 * pdf.js YALNIZCA PDF dersinde yükleniyor (dinamik import): kütüphane ~1 MB,
 * video dersine giren kişi bunu indirmemeli. `parcaYukle` sarmalayıcısı yeni
 * yayın sonrası ölü parça hatasını yakalıyor (bkz. shared/utils/parca-yukle).
 *
 * @param {(sayfa:number, toplam:number) => void} onSayfa — her sayfa değişiminde
 */
export default function PdfViewer({ url, title, onSayfa }) {
    const proxied = proxyR2Url(url);
    const tuvalRef = useRef(null);
    const belgeRef = useRef(null);
    const cizimRef = useRef(null);          // süren render görevi
    const sarmalRef = useRef(null);

    const [durum, setDurum] = useState('yukleniyor');   // yukleniyor | hazir | hata
    const [sayfa, setSayfa] = useState(1);
    const [toplam, setToplam] = useState(0);

    // Belgeyi aç
    useEffect(() => {
        let iptal = false;
        setDurum('yukleniyor');
        setSayfa(1);
        setToplam(0);

        (async () => {
            try {
                const pdfjs = await parcaYukle(() => import('pdfjs-dist'), 'PDF görüntüleyici');
                // Worker aynı paketten; Vite URL'i kendisi paketliyor.
                pdfjs.GlobalWorkerOptions.workerSrc = new URL(
                    'pdfjs-dist/build/pdf.worker.min.mjs',
                    import.meta.url
                ).toString();

                const belge = await pdfjs.getDocument({ url: proxied }).promise;
                if (iptal) { belge.destroy(); return; }
                belgeRef.current = belge;
                setToplam(belge.numPages);
                setDurum('hazir');
            } catch (hata) {
                console.error('PDF açılamadı:', hata);
                if (!iptal) setDurum('hata');
            }
        })();

        return () => {
            iptal = true;
            cizimRef.current?.cancel?.();
            belgeRef.current?.destroy?.();
            belgeRef.current = null;
        };
    }, [proxied]);

    // Sayfayı çiz
    useEffect(() => {
        if (durum !== 'hazir' || !belgeRef.current) return;
        let iptal = false;

        (async () => {
            const pdfSayfa = await belgeRef.current.getPage(sayfa);
            if (iptal) return;

            // Genişliğe sığdır; retina ekranda bulanık olmasın diye piksel
            // oranıyla ölçekleniyor.
            const genislik = sarmalRef.current?.clientWidth || 800;
            const temel = pdfSayfa.getViewport({ scale: 1 });
            const olcek = (genislik - 32) / temel.width;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const viewport = pdfSayfa.getViewport({ scale: olcek * dpr });

            const tuval = tuvalRef.current;
            if (!tuval) return;
            tuval.width = viewport.width;
            tuval.height = viewport.height;
            tuval.style.width = `${viewport.width / dpr}px`;
            tuval.style.height = `${viewport.height / dpr}px`;

            cizimRef.current?.cancel?.();
            cizimRef.current = pdfSayfa.render({ canvasContext: tuval.getContext('2d'), viewport });
            try { await cizimRef.current.promise; } catch { /* iptal edildi */ }
        })();

        return () => { iptal = true; };
    }, [sayfa, durum]);

    // Sayfa/toplam dışarıya bildirilir — dersin tamamlanabilirliği buna bakıyor.
    useEffect(() => {
        if (durum === 'hazir' && toplam > 0) onSayfa?.(sayfa, toplam);
    }, [sayfa, toplam, durum, onSayfa]);

    const git = (yon) => setSayfa((s) => Math.min(toplam, Math.max(1, s + yon)));

    return (
        <div className="flex h-[75vh] min-h-[480px] flex-col bg-card">
            {/* Araç çubuğu */}
            <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#084529]/10 text-[#084529] dark:bg-[#d8c7a3]/10 dark:text-[#d8c7a3]">
                    <FileText className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{title}</div>
                    <div className="text-xs text-muted-foreground">
                        PDF Doküman{toplam > 0 ? ` · ${toplam} sayfa` : ''}
                    </div>
                </div>
                <a
                    href={proxied}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-muted"
                >
                    <ExternalLink className="size-3.5" /> Yeni Sekme
                </a>
                <a
                    href={proxied}
                    download
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#084529] px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[#063a22]"
                >
                    <Download className="size-3.5" /> İndir
                </a>
            </div>

            {/* Gövde */}
            <div ref={sarmalRef} className="relative flex-1 overflow-auto bg-neutral-100 p-4 dark:bg-neutral-900">
                {durum === 'yukleniyor' && (
                    <div className="flex h-full flex-col items-center justify-center gap-3 text-muted-foreground">
                        <Spinner className="size-7" />
                        <p className="text-sm">Belge açılıyor…</p>
                    </div>
                )}

                {durum === 'hata' && (
                    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
                        <AlertTriangle className="size-8 opacity-50" />
                        <p className="text-sm">PDF burada görüntülenemedi.</p>
                        <a
                            href={proxied}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 rounded-lg bg-[#084529] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#063a22]"
                        >
                            <ExternalLink className="size-3.5" /> PDF'i yeni sekmede aç
                        </a>
                    </div>
                )}

                <canvas
                    ref={tuvalRef}
                    className={`mx-auto rounded shadow-sm ${durum === 'hazir' ? '' : 'hidden'}`}
                />
            </div>

            {/* Sayfalama */}
            {durum === 'hazir' && toplam > 0 && (
                <div className="flex items-center justify-between gap-3 border-t bg-muted/30 px-4 py-2.5">
                    <button
                        type="button"
                        onClick={() => git(-1)}
                        disabled={sayfa <= 1}
                        className="inline-flex items-center gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium disabled:opacity-40"
                    >
                        <ChevronLeft className="size-3.5" /> Önceki
                    </button>
                    <span className="text-xs font-medium tabular-nums text-muted-foreground">
                        Sayfa {sayfa} / {toplam}
                    </span>
                    <button
                        type="button"
                        onClick={() => git(1)}
                        disabled={sayfa >= toplam}
                        className="inline-flex items-center gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs font-medium disabled:opacity-40"
                    >
                        Sonraki <ChevronRight className="size-3.5" />
                    </button>
                </div>
            )}
        </div>
    );
}
