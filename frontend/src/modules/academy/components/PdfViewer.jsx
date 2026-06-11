import { useState, useRef, useEffect, useCallback } from 'react';
import { BookOpen, Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, ExternalLink } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import './PdfViewer.css';

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.js',
    import.meta.url
).toString();

export default function PdfViewer({ url, title }) {
    const canvasRef = useRef(null);
    const pdfDocRef = useRef(null);
    const thumbsRef = useRef(null);

    const [numPages, setNumPages] = useState(0);
    const [currentPage, setCurrentPage] = useState(1);
    const [scale, setScale] = useState(1.5);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [thumbnails, setThumbnails] = useState([]);

    // Load PDF
    useEffect(() => {
        if (!url) return;
        let cancelled = false;
        setLoading(true);
        setError(null);

        const loadingTask = pdfjsLib.getDocument(url);
        loadingTask.promise.then(
            (pdf) => {
                if (cancelled) return;
                pdfDocRef.current = pdf;
                setNumPages(pdf.numPages);
                setLoading(false);
                generateThumbnails(pdf);
            },
            (err) => {
                if (cancelled) return;
                console.error('PDF load error:', err);
                setError('PDF yüklenemedi');
                setLoading(false);
            }
        );
        return () => { cancelled = true; };
    }, [url]);

    // Render page
    useEffect(() => {
        if (!pdfDocRef.current || currentPage < 1) return;
        renderPage(currentPage);
    }, [currentPage, scale]);

    const renderPage = useCallback(async (pageNum) => {
        const pdf = pdfDocRef.current;
        if (!pdf) return;
        try {
            const page = await pdf.getPage(pageNum);
            const viewport = page.getViewport({ scale });
            const canvas = canvasRef.current;
            if (!canvas) return;
            const context = canvas.getContext('2d');
            const dpr = window.devicePixelRatio || 1;
            canvas.width = viewport.width * dpr;
            canvas.height = viewport.height * dpr;
            canvas.style.width = `${viewport.width}px`;
            canvas.style.height = `${viewport.height}px`;
            context.scale(dpr, dpr);
            await page.render({ canvasContext: context, viewport }).promise;
        } catch (err) { console.error('Page render error:', err); }
    }, [scale]);

    // Generate thumbnails
    const generateThumbnails = async (pdf) => {
        const thumbs = [];
        for (let i = 1; i <= pdf.numPages; i++) {
            try {
                const page = await pdf.getPage(i);
                const viewport = page.getViewport({ scale: 0.25 });
                const canvas = document.createElement('canvas');
                canvas.width = viewport.width;
                canvas.height = viewport.height;
                await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
                thumbs.push(canvas.toDataURL());
            } catch { thumbs.push(null); }
        }
        setThumbnails(thumbs);
    };

    // Auto-scroll active thumbnail
    useEffect(() => {
        if (!thumbsRef.current) return;
        const active = thumbsRef.current.querySelector('.pdf-viewer-thumb--active');
        if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }, [currentPage]);

    const goToPrev = () => { if (currentPage > 1) setCurrentPage(p => p - 1); };
    const goToNext = () => { if (currentPage < numPages) setCurrentPage(p => p + 1); };
    const zoomIn = () => setScale(s => Math.min(s + 0.25, 3));
    const zoomOut = () => setScale(s => Math.max(s - 0.25, 0.5));

    // Keyboard navigation
    useEffect(() => {
        const handleKey = (e) => {
            if (e.key === 'ArrowLeft') goToPrev();
            else if (e.key === 'ArrowRight') goToNext();
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [currentPage, numPages]);

    if (error) {
        return (
            <div className="pdf-viewer-container">
                <div className="pdf-viewer-toolbar">
                    <div className="pdf-viewer-toolbar-left">
                        <div className="pdf-viewer-toolbar-icon"><BookOpen size={20} strokeWidth={2} /></div>
                        <div><div className="pdf-viewer-toolbar-title">{title}</div><div className="pdf-viewer-toolbar-subtitle">PDF Döküman</div></div>
                    </div>
                </div>
                <div className="pdf-viewer-error">
                    <span style={{ fontSize: '2rem', opacity: 0.4 }}>⚠️</span>
                    <p>{error}</p>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="pdf-viewer-btn pdf-viewer-btn--primary">
                        <ExternalLink size={16} /> PDF'i Aç
                    </a>
                </div>
            </div>
        );
    }

    return (
        <div className="pdf-viewer-container">
            <div className="pdf-viewer-toolbar">
                <div className="pdf-viewer-toolbar-left">
                    <div className="pdf-viewer-toolbar-icon"><BookOpen size={20} strokeWidth={2} /></div>
                    <div>
                        <div className="pdf-viewer-toolbar-title">{title}</div>
                        <div className="pdf-viewer-toolbar-subtitle">{numPages > 0 ? `Sayfa ${currentPage} / ${numPages}` : 'PDF Döküman'}</div>
                    </div>
                </div>
                <div style={{ flex: 1 }} />
                <div className="pdf-viewer-toolbar-actions">
                    <button onClick={zoomOut} className="pdf-viewer-btn" title="Küçült"><ZoomOut size={16} /></button>
                    <span className="pdf-viewer-zoom-label">{Math.round(scale * 100)}%</span>
                    <button onClick={zoomIn} className="pdf-viewer-btn" title="Büyüt"><ZoomIn size={16} /></button>
                    <a href={url} download className="pdf-viewer-btn"><Download size={16} /> İndir</a>
                    <a href={url} target="_blank" rel="noopener noreferrer" className="pdf-viewer-btn pdf-viewer-btn--primary"><Maximize2 size={16} /> Tam Ekran</a>
                </div>
            </div>

            <div className="pdf-viewer-area">
                <div className="pdf-viewer-nav-btn">
                    <button onClick={goToPrev} disabled={currentPage <= 1} className="pdf-viewer-nav-circle"><ChevronLeft size={24} /></button>
                </div>
                <div className="pdf-viewer-canvas-wrapper">
                    {loading ? (
                        <div className="pdf-viewer-loading"><div className="pdf-viewer-spinner" /><span>PDF yükleniyor...</span></div>
                    ) : (
                        <canvas ref={canvasRef} className="pdf-viewer-canvas" />
                    )}
                </div>
                <div className="pdf-viewer-nav-btn">
                    <button onClick={goToNext} disabled={currentPage >= numPages} className="pdf-viewer-nav-circle"><ChevronRight size={24} /></button>
                </div>
            </div>

            {thumbnails.length > 0 && (
                <div className="pdf-viewer-thumbnails-wrapper" ref={thumbsRef}>
                    <div className="pdf-viewer-thumbnails-scroll">
                        {thumbnails.map((thumb, i) => (
                            <button key={i} onClick={() => setCurrentPage(i + 1)}
                                className={`pdf-viewer-thumb ${currentPage === i + 1 ? 'pdf-viewer-thumb--active' : ''}`}>
                                {thumb ? <img src={thumb} alt={`Sayfa ${i + 1}`} /> : <div className="pdf-viewer-thumb-placeholder">{i + 1}</div>}
                                <span className="pdf-viewer-thumb-label">{i + 1}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
