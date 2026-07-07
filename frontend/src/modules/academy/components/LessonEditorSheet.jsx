import { useState, useEffect, useMemo, useRef } from 'react';
import { Video, FileText, HelpCircle, Plus, Trash2, Upload, X, AlertTriangle } from 'lucide-react';
import api from '../../../services/api';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { parseYouTubeInput } from '../utils/youtube';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Spinner } from '@/components/ui/spinner';

const OPTION_IDS = ['A', 'B', 'C', 'D', 'E', 'F'];
const bosForm = { title: '', description: '', lessonType: 'video', passingScore: 70, questions: [] };

/**
 * Ders oluşturma/düzenleme paneli. Modal yerine geniş yan panel: sınav
 * editörü dar modal'a sığmıyordu. Kaydedilmemiş değişiklikte kapatma onayı ister.
 */
export default function LessonEditorSheet({ open, courseId, lesson, onClose, onSaved }) {
    const toast = useToast();
    const confirm = useConfirm();
    const [form, setForm] = useState(bosForm);
    const [fileUrl, setFileUrl] = useState('');
    const [fileName, setFileName] = useState('');
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    const initialRef = useRef('');

    // Panel açılınca formu derse (veya boşa) göre kur ve dirty-takip anlık görüntüsünü al
    useEffect(() => {
        if (!open) return;
        const f = {
            title: lesson?.title || '',
            description: lesson?.description || '',
            lessonType: lesson?.lessonType || 'video',
            passingScore: lesson?.passingScore ?? 70,
            questions: lesson?.questions || [],
        };
        const url = lesson?.videoUrl || lesson?.pdfUrl || '';
        setForm(f);
        setFileUrl(url);
        setFileName('');
        initialRef.current = JSON.stringify({ f, url });
    }, [open, lesson]);

    const isDirty = () => JSON.stringify({ f: form, url: fileUrl }) !== initialRef.current;

    const requestClose = async () => {
        if (isDirty()) {
            const yes = await confirm('Kaydedilmemiş değişiklikler var. Kapatırsanız kaybolacak. Yine de kapatılsın mı?');
            if (!yes) return;
        }
        onClose();
    };

    // YouTube girdisi doğrulama + önizleme
    const videoParse = useMemo(() => parseYouTubeInput(fileUrl.trim()), [fileUrl]);
    const videoGecerli = !fileUrl.trim() ? null : (
        videoParse.type === 'playlist' || (videoParse.type === 'video' && /^[a-zA-Z0-9_-]{11}$/.test(videoParse.id || ''))
    );

    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const { data } = await api.post('/academy/upload/file', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            setFileUrl(data.url);
            setFileName(file.name);
            toast.success('Dosya yüklendi');
        } catch {
            toast.error('Dosya yüklenemedi');
        } finally {
            setUploading(false);
        }
    };

    const setQuestions = (updater) => setForm((f) => ({ ...f, questions: updater(f.questions) }));

    const addQuestion = () => setQuestions((qs) => [...qs, {
        id: Math.random().toString(36).substr(2, 9),
        questionText: '',
        options: [{ id: 'A', text: '' }, { id: 'B', text: '' }, { id: 'C', text: '' }, { id: 'D', text: '' }],
        correctOptionId: 'A',
    }]);

    const addOption = (qIndex) => setQuestions((qs) => qs.map((q, i) => {
        if (i !== qIndex || q.options.length >= OPTION_IDS.length) return q;
        return { ...q, options: [...q.options, { id: OPTION_IDS[q.options.length], text: '' }] };
    }));

    // Yalnızca son şık çıkarılabilir — ara şık silme harf/doğru-cevap eşleşmesini bozar
    const removeLastOption = (qIndex) => setQuestions((qs) => qs.map((q, i) => {
        if (i !== qIndex || q.options.length <= 2) return q;
        const kalan = q.options.slice(0, -1);
        const silinen = q.options[q.options.length - 1];
        return { ...q, options: kalan, correctOptionId: q.correctOptionId === silinen.id ? 'A' : q.correctOptionId };
    }));

    const save = async () => {
        if (!form.title.trim()) return toast.error('Ders başlığı gerekli');
        if (form.lessonType === 'quiz') {
            if (!form.questions || form.questions.length === 0) return toast.error('Sınav için en az bir soru eklemelisiniz');
            const oran = Number(form.passingScore);
            if (!Number.isFinite(oran) || oran < 0 || oran > 100) return toast.error('Geçme notu 0-100 arasında olmalı');
            for (let i = 0; i < form.questions.length; i++) {
                const q = form.questions[i];
                if (!q.questionText?.trim()) return toast.error(`${i + 1}. sorunun metni boş olamaz`);
                if (!q.correctOptionId) return toast.error(`${i + 1}. soru için doğru cevap seçmelisiniz`);
                if (!q.options || q.options.length < 2) return toast.error(`${i + 1}. soru için en az 2 şık eklemelisiniz`);
                for (let j = 0; j < q.options.length; j++) {
                    if (!q.options[j].text?.trim()) return toast.error(`${i + 1}. sorunun ${q.options[j].id} şıkkı boş olamaz`);
                }
            }
        }
        if (form.lessonType === 'video') {
            if (!fileUrl.trim()) return toast.error('Video linki gerekli');
            // Tanınmayan format kaydı engellemesin (eski kayıtlar/nadir URL biçimleri) — onayla geç
            if (!videoGecerli) {
                const yes = await confirm('YouTube linki tanınamadı. Çalışmayan bir link kaydedilirse ders açılmaz. Yine de kaydedilsin mi?');
                if (!yes) return;
            }
        }
        if (form.lessonType === 'pdf' && !fileUrl) return toast.error('PDF dosyası yükleyin');

        const payload = {
            title: form.title,
            description: form.description,
            lessonType: form.lessonType,
            videoUrl: form.lessonType === 'video' ? fileUrl.trim() : '',
            pdfUrl: form.lessonType === 'pdf' ? fileUrl : '',
            passingScore: form.lessonType === 'quiz' ? Number(form.passingScore) : null,
            questions: form.lessonType === 'quiz' ? form.questions : null,
        };
        setSaving(true);
        try {
            if (lesson) {
                await api.put(`/academy/lessons/${courseId}/${lesson.id}`, payload);
                toast.success('Ders güncellendi');
            } else {
                await api.post(`/academy/lessons/${courseId}`, payload);
                toast.success('Ders eklendi');
            }
            initialRef.current = JSON.stringify({ f: form, url: fileUrl }); // artık dirty değil
            onSaved(courseId);
            onClose();
        } catch (err) {
            toast.error(err.response?.data?.error || 'İşlem başarısız');
        } finally {
            setSaving(false);
        }
    };

    const tipSecici = (tip, Icon, etiket, renk) => (
        <button
            type="button"
            onClick={() => {
                if (form.lessonType === tip) return; // aynı tipe tekrar tıklamak mevcut içeriği silmesin
                setForm((f) => ({ ...f, lessonType: tip })); setFileUrl(''); setFileName('');
            }}
            className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border transition-colors ${form.lessonType === tip ? renk : 'border-border bg-card text-muted-foreground hover:bg-muted/50'}`}
        >
            <Icon className="size-5" />
            <span className="text-xs font-medium">{etiket}</span>
        </button>
    );

    return (
        <Sheet open={open} onOpenChange={(o) => { if (!o) requestClose(); }}>
            <SheetContent side="right" className="data-[side=right]:sm:max-w-2xl w-full gap-0 p-0">
                <SheetHeader className="border-b px-5 py-4">
                    <SheetTitle>{lesson ? 'Ders Düzenle' : 'Yeni Ders'}</SheetTitle>
                    <SheetDescription className="text-xs">
                        {form.lessonType === 'quiz' ? 'Soruları ekleyin, doğru cevabı işaretleyin.' : 'Ders bilgilerini ve içeriğini girin.'}
                    </SheetDescription>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Ders Başlığı</Label>
                        <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="Örn: Kadayıf Hamuru Hazırlığı" autoFocus className="h-9" />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Açıklama</Label>
                        <Textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Kısa açıklama girin..." rows={2} className="resize-none" />
                    </div>

                    <div className="space-y-1.5">
                        <Label className="text-xs font-medium">Ders Formatı</Label>
                        <div className="grid grid-cols-3 gap-2">
                            {tipSecici('video', Video, 'Video', 'border-blue-300 bg-blue-50 text-blue-700 ring-1 ring-blue-500/20')}
                            {tipSecici('pdf', FileText, 'PDF Doküman', 'border-amber-300 bg-amber-50 text-amber-700 ring-1 ring-amber-500/20')}
                            {tipSecici('quiz', HelpCircle, 'Sınav', 'border-emerald-300 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20')}
                        </div>
                    </div>

                    {form.lessonType === 'video' && (
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">YouTube Video URL veya ID</Label>
                            <Input
                                value={fileUrl}
                                onChange={(e) => setFileUrl(e.target.value)}
                                placeholder="Örn: https://youtube.com/watch?v=... veya dQw4w9WgXcQ"
                                className="h-9"
                            />
                            <p className="text-[10px] text-muted-foreground">YouTube video linki, video ID veya playlist linki yapıştırın.</p>
                            {videoGecerli === false && (
                                <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                                    <AlertTriangle className="size-3.5 shrink-0" />
                                    Bu girdi bir YouTube video/playlist linkine benzemiyor — kaydetmeden önce kontrol edin.
                                </div>
                            )}
                            {videoGecerli && videoParse.type === 'video' && (
                                <div className="flex items-center gap-3 rounded-lg border bg-muted/20 p-2">
                                    <img
                                        src={`https://img.youtube.com/vi/${videoParse.id}/mqdefault.jpg`}
                                        alt="Video önizleme"
                                        className="h-16 w-28 rounded-md object-cover border"
                                    />
                                    <div className="text-xs text-muted-foreground">
                                        <div className="font-medium text-foreground">Video bulundu ✓</div>
                                        <div className="mt-0.5">ID: {videoParse.id}</div>
                                    </div>
                                </div>
                            )}
                            {videoGecerli && videoParse.type === 'playlist' && (
                                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                                    Playlist algılandı ✓ (ID: {videoParse.id})
                                </div>
                            )}
                        </div>
                    )}

                    {form.lessonType === 'pdf' && (
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">PDF Dosyası</Label>
                            {fileUrl ? (
                                <div className="flex items-center gap-3 rounded-lg border bg-emerald-50/50 p-3">
                                    <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-600">
                                        <FileText className="size-4" />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="text-xs font-medium text-foreground truncate">{fileName || 'Dosya başarıyla yüklendi'}</div>
                                        <div className="text-[10px] text-emerald-600 font-medium">Yükleme Tamamlandı ✓</div>
                                    </div>
                                    <Button variant="outline" size="icon" className="size-7 bg-background shrink-0 hover:border-destructive hover:text-destructive" onClick={() => { setFileUrl(''); setFileName(''); }}>
                                        <X className="size-3.5" />
                                    </Button>
                                </div>
                            ) : (
                                <label className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center transition-colors ${uploading ? 'bg-muted/50 border-muted' : 'border-border hover:border-primary/40 hover:bg-muted/20'}`}>
                                    <input type="file" accept="application/pdf" onChange={handleFileUpload} className="hidden" disabled={uploading} />
                                    {uploading ? (
                                        <>
                                            <Spinner className="size-6 text-primary" />
                                            <span className="text-xs font-medium text-muted-foreground mt-1">Dosya sunucuya yükleniyor...</span>
                                        </>
                                    ) : (
                                        <>
                                            <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                                                <Upload className="size-5" />
                                            </div>
                                            <div>
                                                <span className="text-sm font-medium text-foreground block">Tıklayın veya sürükleyin</span>
                                                <span className="text-xs text-muted-foreground mt-0.5 block">Maksimum dosya boyutu: 100MB</span>
                                            </div>
                                        </>
                                    )}
                                </label>
                            )}
                        </div>
                    )}

                    {form.lessonType === 'quiz' && (
                        <div className="space-y-4 border-t pt-4">
                            <div className="space-y-1.5 max-w-[200px]">
                                <Label className="text-xs font-medium">Geçme Notu (0-100)</Label>
                                <Input type="number" min="0" max="100" value={form.passingScore} onChange={(e) => setForm((f) => ({ ...f, passingScore: e.target.value }))} className="h-9" />
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-xs font-medium">Sorular ({form.questions.length})</Label>
                                    <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={addQuestion}>
                                        <Plus className="size-3 mr-1" /> Soru Ekle
                                    </Button>
                                </div>

                                {form.questions.map((q, qIndex) => (
                                    <div key={q.id} className="rounded-lg border p-4 bg-muted/20 relative space-y-3">
                                        <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 size-6 text-muted-foreground hover:text-destructive" onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== qIndex))} title="Soruyu sil">
                                            <Trash2 className="size-3.5" />
                                        </Button>
                                        <div className="space-y-1.5 pr-8">
                                            <Label className="text-xs font-medium">{qIndex + 1}. Soru Metni</Label>
                                            <Textarea value={q.questionText} onChange={(e) => setQuestions((qs) => qs.map((x, i) => i === qIndex ? { ...x, questionText: e.target.value } : x))} rows={2} className="resize-none text-sm p-2" placeholder="Sorunuzu yazın..." />
                                        </div>
                                        <div className="space-y-2">
                                            <Label className="text-xs font-medium">Şıklar (Doğru cevabı seçin)</Label>
                                            {q.options.map((opt, oIndex) => (
                                                <div key={opt.id} className="flex items-center gap-2">
                                                    <input type="radio" name={`correct_${q.id}`} checked={q.correctOptionId === opt.id} onChange={() => setQuestions((qs) => qs.map((x, i) => i === qIndex ? { ...x, correctOptionId: opt.id } : x))} className="cursor-pointer" />
                                                    <span className="text-xs font-bold w-4 text-center">{opt.id})</span>
                                                    <Input value={opt.text} onChange={(e) => setQuestions((qs) => qs.map((x, i) => {
                                                        if (i !== qIndex) return x;
                                                        const options = x.options.map((o, j) => j === oIndex ? { ...o, text: e.target.value } : o);
                                                        return { ...x, options };
                                                    }))} className="h-8 text-xs flex-1" placeholder="Şık metni..." />
                                                </div>
                                            ))}
                                            <div className="flex gap-2 pt-1">
                                                <Button type="button" variant="outline" size="sm" className="h-6 text-[11px] px-2" onClick={() => addOption(qIndex)} disabled={q.options.length >= OPTION_IDS.length}>
                                                    <Plus className="size-3 mr-1" /> Şık Ekle
                                                </Button>
                                                <Button type="button" variant="outline" size="sm" className="h-6 text-[11px] px-2 text-muted-foreground" onClick={() => removeLastOption(qIndex)} disabled={q.options.length <= 2}>
                                                    <X className="size-3 mr-1" /> Son Şıkkı Çıkar
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {form.questions.length === 0 && (
                                    <div className="text-center py-6 border border-dashed rounded-lg bg-card text-muted-foreground">
                                        <HelpCircle className="size-8 mx-auto mb-2 opacity-20" />
                                        <p className="text-xs">Sınava henüz soru eklemediniz.</p>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="border-t bg-card/50 px-5 py-3 flex justify-end gap-2 shrink-0">
                    <Button variant="outline" size="sm" onClick={requestClose}>İptal</Button>
                    <Button size="sm" onClick={save} disabled={uploading || saving}>
                        {saving && <Spinner className="size-3.5 mr-1.5" />}
                        {lesson ? 'Değişiklikleri Kaydet' : 'Dersi Ekle'}
                    </Button>
                </div>
            </SheetContent>
        </Sheet>
    );
}
