import { FileText, Download, ExternalLink, AlertTriangle } from 'lucide-react';
import { proxyR2Url } from '../../../utils/imageProxy';

/**
 * PDF görüntüleyici — tarayıcının yerel PDF motoru (<object>) ile.
 * r2.dev doğrudan erişilemediği için PDF backend proxy üzerinden sunulur
 * (görsellerle aynı yol). Görüntülenemezse fallback "yeni sekmede aç" gösterilir.
 */
export default function PdfViewer({ url, title }) {
    const proxied = proxyR2Url(url);
    // Yerel görüntüleyici parametreleri: araç çubuğu açık, sayfa paneli kapalı, genişliğe sığdır
    const src = `${proxied}#toolbar=1&navpanes=0&view=FitH`;

    return (
        <div className="flex h-[75vh] min-h-[480px] flex-col bg-card">
            {/* Araç çubuğu */}
            <div className="flex items-center gap-3 border-b bg-muted/30 px-4 py-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#084529]/10 text-[#084529] dark:bg-[#d8c7a3]/10 dark:text-[#d8c7a3]">
                    <FileText className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-foreground">{title}</div>
                    <div className="text-xs text-muted-foreground">PDF Doküman</div>
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

            {/* Gövde — yerel PDF görüntüleyici */}
            <div className="relative flex-1 bg-neutral-100 dark:bg-neutral-900">
                <object data={src} type="application/pdf" className="h-full w-full">
                    {/* Tarayıcı PDF gömmeyi desteklemiyorsa */}
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
                </object>
            </div>
        </div>
    );
}
