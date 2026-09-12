import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Video, FileText, CheckCircle, Circle, ChevronLeft, ChevronRight, HelpCircle, XCircle, Lock, Award } from 'lucide-react';
import VideoPlayer from '../components/VideoPlayer';
import PdfViewer from '../components/PdfViewer';
import api from '../../../services/api';
import { useToast } from '../../../shared/components/Toast';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

// Videonun tamamlanmış sayılması için izlenmesi gereken oran. %100 istemek
// pratikte tuzak: son saniyeler jenerik oluyor, tarayıcı 'ended' olayını
// bazen tam sürede tetiklemiyor.
const IZLEME_ESIGI = 0.9;

export default function CourseDetail() {
    const { courseId } = useParams();
    const navigate = useNavigate();
    const toast = useToast();

    const [course, setCourse] = useState(null);
    const [lessons, setLessons] = useState([]);
    const [currentLesson, setCurrentLesson] = useState(null);
    const [loading, setLoading] = useState(true);
    const [completed, setCompleted] = useState({});
    const [completing, setCompleting] = useState(false);
    const [quizAnswers, setQuizAnswers] = useState({});
    const [quizResult, setQuizResult] = useState(null);
    const [submittingQuiz, setSubmittingQuiz] = useState(false);
    // Kayıtlı deneme yükleniyor mu — sınav ekranı, hak kullanılmışsa soruları
    // hiç göstermemeli; yükleme bitmeden form çizilirse bir an açık görünür.
    const [denemeYukleniyor, setDenemeYukleniyor] = useState(false);
    // İçeriğin sonuna gelindi mi (video izleme oranı / PDF son sayfa).
    // Ders değişince sıfırlanır.
    const [sonaGelindi, setSonaGelindi] = useState(false);
    // Kurs listesi: son dersten sonra bir SONRAKİ KURSA geçebilmek için.
    const [kurslar, setKurslar] = useState([]);

    useEffect(() => { fetchCourseData(); }, [courseId]);

    // Kurs listesi bir kez: "Sonraki Ders" son derste bir sonraki kursa
    // atlıyor, sıralamayı bu listeden alıyoruz.
    useEffect(() => {
        api.get('/academy/courses')
            .then(({ data }) => setKurslar(data.courses || []))
            .catch(() => {});
    }, []);

    // Ders değişince "sonuna gelindi" işareti sıfırlanır ve sınavsa kayıtlı
    // deneme çekilir.
    useEffect(() => {
        setSonaGelindi(false);
        setQuizAnswers({});
        setQuizResult(null);
        if (!currentLesson || currentLesson.lessonType !== 'quiz') return;

        let iptal = false;
        setDenemeYukleniyor(true);
        api.get(`/academy/progress/quiz/${courseId}/${currentLesson.id}/deneme`)
            .then(({ data }) => { if (!iptal && data.deneme) setQuizResult(data.deneme); })
            .catch(() => {})
            .finally(() => { if (!iptal) setDenemeYukleniyor(false); });
        return () => { iptal = true; };
    }, [currentLesson, courseId]);

    const fetchCourseData = async () => {
        try {
            const [courseRes, progressRes] = await Promise.all([
                api.get(`/academy/courses/${courseId}`),
                api.get(`/academy/progress/${courseId}`),
            ]);
            const c = courseRes.data.course;
            setCourse(c);
            setLessons(c.lessons || []);
            setCompleted(progressRes.data.completed || {});
            if (c.lessons?.length > 0) {
                // İlk tamamlanmamış dersi bul, yoksa ilk dersi seç
                const firstUncompleted = c.lessons.find(l => !progressRes.data.completed?.[l.id]);
                setCurrentLesson(firstUncompleted || c.lessons[0]);
            }
        } catch {
            toast.error('Kurs verileri yüklenemedi');
        } finally {
            setLoading(false);
        }
    };

    const toggleComplete = async () => {
        if (!currentLesson) return;
        if (currentLesson.lessonType === 'quiz') {
            toast.error('Sınavları tamamlamak için sınavı bitirmeniz gerekmektedir.');
            return;
        }
        setCompleting(true);
        try {
            const isCompleted = !!completed[currentLesson.id];
            if (isCompleted) {
                await api.delete(`/academy/progress/${courseId}/${currentLesson.id}`);
                setCompleted(prev => {
                    const next = { ...prev };
                    delete next[currentLesson.id];
                    return next;
                });
                toast.info('Tamamlanma işareti kaldırıldı');
            } else {
                await api.post(`/academy/progress/${courseId}/${currentLesson.id}`);
                setCompleted(prev => ({
                    ...prev,
                    [currentLesson.id]: { courseId, completedAt: new Date().toISOString() },
                }));
                toast.success('Ders tamamlandı! ✓');
                // Otomatik sonraki derse geç
                const idx = lessons.findIndex(l => l.id === currentLesson.id);
                if (idx < lessons.length - 1) {
                    setCurrentLesson(lessons[idx + 1]);
                }
            }
        } catch {
            toast.error('İşlem başarısız');
        } finally {
            setCompleting(false);
        }
    };

    /**
     * Sıradaki kurs — son dersten sonra "Sonraki Ders" burada devam ediyor.
     *
     * Kurslar akademide bir SIRA ile diziliyor ("Eğitim ve Hizmet
     * Standartları" bitince "LED Ekranlar"). Önceden gezinme kursun içinde
     * kilitliydi: son derste düğme sönüyor ve kişi listeye dönüp sıradaki
     * kursu kendi bulmak zorunda kalıyordu.
     */
    const sonrakiKurs = (() => {
        if (kurslar.length === 0) return null;
        const i = kurslar.findIndex(k => k.id === courseId);
        return i >= 0 && i < kurslar.length - 1 ? kurslar[i + 1] : null;
    })();

    const goToNextLesson = () => {
        const idx = lessons.findIndex(l => l.id === currentLesson?.id);
        if (idx < lessons.length - 1) {
            setCurrentLesson(lessons[idx + 1]);
            return;
        }
        if (sonrakiKurs) navigate(`/admin/akademi/kurs/${sonrakiKurs.id}`);
    };

    const goToPrevLesson = () => {
        const idx = lessons.findIndex(l => l.id === currentLesson?.id);
        if (idx > 0) {
            setQuizAnswers({}); setQuizResult(null);
            setCurrentLesson(lessons[idx - 1]);
        }
    };

    const submitQuiz = async () => {
        if (!currentLesson || currentLesson.lessonType !== 'quiz') return;
        setSubmittingQuiz(true);
        try {
            const { data } = await api.post(`/academy/progress/quiz/${courseId}/${currentLesson.id}/submit`, {
                answers: quizAnswers
            });
            setQuizResult(data);
            if (data.passed) {
                setCompleted(prev => ({ ...prev, [currentLesson.id]: { courseId, score: data.score, completedAt: new Date().toISOString() } }));
                toast.success(`Sınavı Geçtiniz! Puanınız: ${data.score}`);
            } else {
                toast.error(`Sınavı Geçemediniz. Puanınız: ${data.score} (Baraj: ${data.passingScore})`);
            }
        } catch (err) {
            // 409 = hak zaten kullanılmış (başka sekmede çözülmüş olabilir):
            // hata gösterip bırakmak yerine kayıtlı sonucu getiriyoruz.
            if (err.response?.status === 409) {
                try {
                    const { data } = await api.get(`/academy/progress/quiz/${courseId}/${currentLesson.id}/deneme`);
                    if (data.deneme) setQuizResult(data.deneme);
                } catch { /* sonuç çekilemedi, aşağıdaki mesaj yeterli */ }
                toast.error('Bu sınavı zaten çözmüşsünüz.');
            } else {
                toast.error(err.response?.data?.error || 'Sınav gönderilemedi');
            }
        } finally {
            setSubmittingQuiz(false);
        }
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center gap-3 py-16"><Spinner className="size-8" /><p className="text-sm text-muted-foreground">Yükleniyor...</p></div>
    );

    if (!course) return (
        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground border border-dashed rounded-lg bg-card max-w-2xl mx-auto w-full mt-10">
            <span className="text-4xl opacity-50">⚠️</span>
            <p className="text-sm font-medium text-foreground">Kurs bulunamadı</p>
            <Button variant="outline" size="sm" onClick={() => navigate('/admin/akademi')}>Geri Dön</Button>
        </div>
    );

    const currentIdx = lessons.findIndex(l => l.id === currentLesson?.id);
    const sonDers = currentIdx >= lessons.length - 1;
    // Video/PDF derslerinde "Dersi Tamamla" ancak içerik sonuna gelince açılır.
    // Önceden ders ortasında da basılabiliyordu; ilerleme yüzdesi kişinin
    // gerçekten izlediğini/okuduğunu göstermiyordu.
    const icerikKilidi = !!currentLesson
        && !completed[currentLesson.id]
        && (currentLesson.lessonType === 'video' || currentLesson.lessonType === 'pdf')
        && !sonaGelindi;
    const sonrakiVar = !sonDers || !!sonrakiKurs;
    const completedCount = Object.keys(completed).length;
    const totalCount = lessons.length;
    const progressPct = totalCount > 0 ? Math.min(100, Math.round((completedCount / totalCount) * 100)) : 0;

    return (
        <div className="flex flex-1 flex-col gap-4 w-full h-full min-h-0">
            {/* Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3">
                    <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => navigate('/admin/akademi')} title="Akademiye Dön">
                        <ArrowLeft className="size-4" />
                    </Button>
                    <div className="min-w-0 flex-1">
                        <h1 className="text-xl font-bold text-foreground leading-tight">{course.title}</h1>
                        {course.description && (
                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{course.description}</p>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                    <div className="flex flex-col items-end">
                        <span className="text-xs font-medium text-muted-foreground">İlerleme: {completedCount}/{totalCount}</span>
                        <span className={`text-sm font-bold ${progressPct === 100 ? 'text-emerald-600' : 'text-primary'}`}>%{progressPct}</span>
                    </div>
                    <div className="h-10 w-10 rounded-full border-4 border-muted relative flex items-center justify-center shrink-0">
                        {progressPct === 100 ? <CheckCircle className="size-4 text-emerald-600" /> : <span className="text-[10px] font-bold">{progressPct}%</span>}
                        <svg className="absolute inset-0 size-full -rotate-90" viewBox="0 0 36 36">
                            <path
                                className={`text-${progressPct === 100 ? 'emerald' : 'primary'}-500 transition-all duration-500 ease-out`}
                                strokeDasharray={`${progressPct}, 100`}
                                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="4"
                            />
                        </svg>
                    </div>
                </div>
            </div>

            {lessons.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground border border-dashed rounded-lg bg-card">
                    <span className="text-4xl opacity-50">📚</span>
                    <div className="text-center">
                        <p className="text-sm font-medium text-foreground">Bu kursta henüz ders yok</p>
                        <p className="text-xs text-muted-foreground mt-1">İçerikler kısa süre içinde eklenecektir.</p>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col lg:flex-row gap-5 flex-1 min-h-0 overflow-y-auto lg:overflow-hidden pb-4 lg:pb-0">
                    {/* Main Content */}
                    <div className="flex-1 flex flex-col space-y-4 min-w-0 h-full lg:overflow-y-auto">
                        {currentLesson && (
                            <>
                                {/* Video / PDF Viewer */}
                                <div className={`overflow-hidden rounded-xl border bg-black ${currentLesson.lessonType === 'video' || currentLesson.lessonType === 'pdf' ? '' : 'flex-1 min-h-0 flex flex-col'}`}>
                                    {currentLesson.lessonType === 'video' ? (
                                        currentLesson.videoUrl ? (
                                            <VideoPlayer
                                                key={currentLesson.id}
                                                videoId={currentLesson.videoUrl}
                                                title={currentLesson.title}
                                                // Kilit YALNIZCA izlenen orana bakar; 'ended'
                                                // olayı tek başına açmıyor çünkü sona sürükleyip
                                                // bırakmak da onu tetikliyor.
                                                onProgress={(oran) => { if (oran >= IZLEME_ESIGI) setSonaGelindi(true); }}
                                            />
                                        ) : (
                                                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground bg-muted/10 border-b border-border/10 min-h-[300px]">
                                                <div className="size-16 rounded-full bg-muted/20 flex items-center justify-center"><Video className="size-8 opacity-50" /></div>
                                                <p className="text-sm font-medium">Video henüz yüklenmemiş</p>
                                            </div>
                                        )
                                    ) : currentLesson.lessonType === 'pdf' ? (
                                        currentLesson.pdfUrl ? (
                                            <PdfViewer
                                                key={currentLesson.id}
                                                url={currentLesson.pdfUrl}
                                                title={currentLesson.title}
                                                onSayfa={(sayfa, toplam) => {
                                                    if (toplam > 0 && sayfa >= toplam) setSonaGelindi(true);
                                                }}
                                            />
                                        ) : (
                                                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground bg-muted/10 border-b border-border/10 min-h-[300px]">
                                                <div className="size-16 rounded-full bg-muted/20 flex items-center justify-center"><FileText className="size-8 opacity-50" /></div>
                                                <p className="text-sm font-medium">PDF henüz yüklenmemiş</p>
                                            </div>
                                        )
                                    ) : (
                                        <div className="bg-card p-6 flex-1 flex flex-col items-center overflow-y-auto min-h-[300px]">
                                            <div className="size-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
                                                <HelpCircle className="size-8" />
                                            </div>
                                            <h3 className="text-lg font-bold mb-2">Sınav: {currentLesson.title}</h3>
                                            <p className="text-sm text-muted-foreground mb-6 text-center">Bu sınav {currentLesson.questions?.length || 0} sorudan oluşmaktadır. Geçme notu: {currentLesson.passingScore}</p>
                                            
                                            {denemeYukleniyor ? (
                                                <div className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
                                                    <Spinner className="size-5" /> Sınav durumu kontrol ediliyor…
                                                </div>
                                            ) : quizResult ? (
                                                /* SONUÇ EKRANI — hak kullanıldığında sorular bir daha
                                                   çözülebilir olarak çizilmiyor. Yanlışlar ve doğru
                                                   şıklar burada açılıyor; önceki sürüm yalnızca yüzde
                                                   gösterip hangi soruyu kaçırdığını söylemiyordu. */
                                                <SinavSonucu
                                                    sonuc={quizResult}
                                                    sonrakiVar={sonrakiVar}
                                                    sonDers={sonDers}
                                                    sonrakiKurs={sonrakiKurs}
                                                    onSonraki={goToNextLesson}
                                                />
                                            ) : (
                                                <div className="w-full max-w-2xl text-left space-y-6">
                                                    <div className="flex items-start gap-2.5 rounded-lg border border-amber-500/40 bg-amber-500/5 p-3.5 text-sm text-amber-800 dark:text-amber-300">
                                                        <Lock className="mt-0.5 size-4 shrink-0" />
                                                        <span>
                                                            <strong>Sınav bir kez çözülür.</strong> Gönderdikten sonra
                                                            cevaplarınızı değiştiremezsiniz; yeni hak yalnızca merkez
                                                            tarafından tanımlanabilir.
                                                        </span>
                                                    </div>

                                                    {currentLesson.questions?.map((q, i) => (
                                                        <div key={q.id} className="p-4 border rounded-lg bg-background">
                                                            <h4 className="font-medium text-foreground mb-4">{i + 1}. {q.questionText}</h4>
                                                            <div className="space-y-2">
                                                                {q.options?.map(opt => (
                                                                    <label key={opt.id} className={`flex items-center gap-3 p-3 border rounded-md cursor-pointer transition-colors ${quizAnswers[q.id] === opt.id ? 'bg-primary/5 border-primary/30 text-primary' : 'hover:bg-muted'}`}>
                                                                        <input type="radio" name={q.id} checked={quizAnswers[q.id] === opt.id} onChange={() => setQuizAnswers(prev => ({ ...prev, [q.id]: opt.id }))} className="size-4" />
                                                                        <span className="text-sm font-bold w-4 text-center">{opt.id})</span>
                                                                        <span className="text-sm">{opt.text}</span>
                                                                    </label>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                    <Button onClick={submitQuiz} disabled={submittingQuiz || Object.keys(quizAnswers).length < (currentLesson.questions?.length || 0)} className="w-full" size="lg">
                                                        {submittingQuiz ? <Spinner className="size-5 mr-2" /> : null} Sınavı Bitir
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Lesson Info + Actions */}
                                <div className="rounded-xl border bg-card p-4 sm:p-5 flex-shrink-0">
                                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                        <div className="flex gap-3.5">
                                            <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${currentLesson.lessonType === 'video' ? 'bg-blue-100 text-blue-600' : 'bg-amber-100 text-amber-600'} border border-black/5`}>
                                                {currentLesson.lessonType === 'video' ? <Video className="size-5" /> : <FileText className="size-5" />}
                                            </div>
                                            <div>
                                                <h2 className="text-base font-bold text-foreground leading-tight mb-1">{currentLesson.title}</h2>
                                                <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                                                    <Badge variant="secondary" className="px-1.5 py-0 h-5 text-[10px] uppercase tracking-wider">{currentLesson.lessonType === 'video' ? 'Video İçerik' : currentLesson.lessonType === 'pdf' ? 'PDF Doküman' : 'Sınav'}</Badge>
                                                    <span>Ders {currentIdx + 1} / {lessons.length}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="flex flex-col items-stretch sm:items-end gap-1.5 shrink-0">
                                            <Button
                                                variant={completed[currentLesson.id] ? 'outline' : 'default'}
                                                size="sm"
                                                onClick={toggleComplete}
                                                disabled={completing || icerikKilidi}
                                                className={`w-full sm:w-auto ${completed[currentLesson.id] ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800' : ''}`}
                                            >
                                                {currentLesson.lessonType !== 'quiz' && (
                                                    completed[currentLesson.id] ? (
                                                        <><CheckCircle className="size-4 mr-1.5" /> Tamamlandı</>
                                                    ) : (
                                                        <><Circle className="size-4 mr-1.5" /> Dersi Tamamla</>
                                                    )
                                                )}
                                                {currentLesson.lessonType === 'quiz' && (
                                                    completed[currentLesson.id] ? (
                                                        <><CheckCircle className="size-4 mr-1.5" /> Geçildi (Puan: {completed[currentLesson.id]?.score || quizResult?.score || currentLesson.passingScore})</>
                                                    ) : (
                                                        <><HelpCircle className="size-4 mr-1.5" /> Sınavı Tamamlayın</>
                                                    )
                                                )}
                                            </Button>
                                            {/* Kilidin SEBEBİ yazılı olmalı: sönük bir düğme
                                                "bozuk" gibi görünüyor. */}
                                            {icerikKilidi && (
                                                <span className="text-[11px] text-muted-foreground sm:text-right">
                                                    {currentLesson.lessonType === 'video'
                                                        ? 'Videoyu sonuna kadar izleyin'
                                                        : 'Belgenin son sayfasına gelin'}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {currentLesson.description && (
                                        <div className="mt-4 rounded-lg bg-muted/30 p-3.5 text-sm text-foreground/80 leading-relaxed border border-border/50">
                                            {currentLesson.description}
                                        </div>
                                    )}

                                    {/* TELEFONDA ALT ALTA. İki düğme de `w-full` ama satır
                                        yan yana duruyordu: her biri kabın tamamını istedi,
                                        toplam 618px oldu ve "Sonraki Ders" ekranın dışında
                                        kaldı — dersler arasında ilerlemek imkânsızdı.
                                        Uzun kurs adı da düğmeyi şişirmesin diye kırpılıyor. */}
                                    <div className="mt-5 flex flex-col gap-2 border-t pt-4 sm:flex-row sm:justify-between sm:gap-3">
                                        <Button variant="outline" size="sm" onClick={goToPrevLesson} disabled={currentIdx <= 0} className="h-10 w-full sm:h-8 sm:w-auto">
                                            <ChevronLeft className="size-4 mr-1" /> Önceki Ders
                                        </Button>
                                        <Button size="sm" onClick={goToNextLesson} disabled={!sonrakiVar} className="h-10 w-full min-w-0 sm:h-8 sm:w-auto">
                                            <span className="truncate">
                                                {sonDers && sonrakiKurs
                                                    ? <>Sonraki Kurs: {sonrakiKurs.title}</>
                                                    : <>Sonraki Ders</>}
                                            </span>
                                            <ChevronRight className="size-4 ml-1 shrink-0" />
                                        </Button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>

                    {/* Sidebar / Lesson List */}
                    <div className="w-full lg:w-[320px] shrink-0 flex flex-col gap-4 lg:h-full">
                        {/* Progress Details */}
                        <div className="rounded-xl border bg-card overflow-hidden flex-shrink-0">
                            <div className="bg-muted/30 px-4 py-3 border-b">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Eğitim İlerlemesi</h3>
                            </div>
                            <div className="px-4 py-4 space-y-3">
                                <div className="flex items-end justify-between">
                                    <div className="text-sm font-medium text-foreground">Toplam İlerleme</div>
                                    <div className={`text-lg font-bold leading-none ${progressPct === 100 ? 'text-emerald-600' : 'text-primary'}`}>%{progressPct}</div>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-muted">
                                    <div className="h-full rounded-full bg-primary transition-all duration-700 ease-out" style={{ width: `${progressPct}%` }} />
                                </div>
                                <div className="text-xs font-medium text-muted-foreground flex items-center justify-between">
                                    <span>Tamamlanan Ders:</span>
                                    <span className="text-foreground">{completedCount} / {totalCount}</span>
                                </div>
                            </div>
                        </div>

                        {/* Lesson List */}
                        <div className="rounded-xl border bg-card overflow-hidden flex flex-col flex-1 lg:min-h-0">
                            <div className="bg-muted/30 px-4 py-3 border-b flex items-center justify-between shrink-0">
                                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">İçerikler</h3>
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-5">{lessons.length} Ders</Badge>
                            </div>
                            <div className="overflow-y-auto flex-1 p-2 space-y-1">
                                {lessons.map((lesson, i) => (
                                    <div
                                        key={lesson.id}
                                        className={`group flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-all ${currentLesson?.id === lesson.id ? 'bg-primary/5 ring-1 ring-primary/20' : 'hover:bg-muted/50'}`}
                                        onClick={() => {
                                            setQuizAnswers({}); setQuizResult(null);
                                            setCurrentLesson(lesson);
                                        }}
                                    >
                                        <div className="mt-0.5 flex shrink-0 items-center justify-center">
                                            {completed[lesson.id] ? (
                                                <div className="flex size-5 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                                                    <CheckCircle className="size-3.5" />
                                                </div>
                                            ) : (
                                                <div className={`flex size-5 items-center justify-center rounded-full text-[10px] font-bold ${currentLesson?.id === lesson.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                                    {i + 1}
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className={`text-sm font-medium leading-tight mb-1 ${completed[lesson.id] ? 'text-muted-foreground' : 'text-foreground'} ${currentLesson?.id === lesson.id ? 'font-bold' : ''}`}>
                                                {lesson.title}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground">
                                                <div className="flex items-center gap-1">
                                                    {lesson.lessonType === 'video' ? <Video className="size-3" /> : lesson.lessonType === 'pdf' ? <FileText className="size-3" /> : <HelpCircle className="size-3" />}
                                                    <span className="uppercase">{lesson.lessonType === 'video' ? 'Video' : lesson.lessonType === 'pdf' ? 'PDF' : 'Sınav'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}


/**
 * Sınav sonucu — puan, soru soru inceleme ve sonraki derse geçiş.
 *
 * DOĞRU ŞIKLAR yalnızca burada görünür: sorular sınav ekranına doğru cevap
 * OLMADAN gidiyor, doğrular ancak deneme kaydedildikten sonra sunucudan
 * geliyor (bkz. soruSonuclari, backend progress.js).
 */
function SinavSonucu({ sonuc, sonrakiVar, sonDers, sonrakiKurs, onSonraki }) {
    const gecti = sonuc.passed;
    const sorular = sonuc.sorular || [];
    const yanlisSayisi = sorular.filter((q) => !q.dogruMu).length;

    return (
        <div className="w-full max-w-2xl space-y-5 text-left">
            <div className={`flex flex-col items-center rounded-xl border p-6 text-center ${
                gecti
                    ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                    : 'border-destructive/30 bg-destructive/5'
            }`}>
                <div className={`mb-3 flex size-16 items-center justify-center rounded-full ${
                    gecti ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50' : 'bg-destructive/10 text-destructive'
                }`}>
                    {gecti ? <Award className="size-8" /> : <XCircle className="size-8" />}
                </div>
                <h4 className={`text-xl font-bold ${gecti ? 'text-emerald-700 dark:text-emerald-400' : 'text-destructive'}`}>
                    {gecti ? 'Sınavı geçtiniz' : 'Sınavı geçemediniz'}
                </h4>
                <p className="mt-1 text-sm text-foreground">
                    Puanınız <strong>%{sonuc.score}</strong> · Baraj %{sonuc.passingScore}
                </p>
                {sorular.length > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                        {sorular.length - yanlisSayisi} doğru, {yanlisSayisi} yanlış
                    </p>
                )}
                {/* Kalındığında ne yapılacağı YAZILI olmalı: tek deneme kuralı
                    yüzünden kişi kendi başına tekrar giremiyor. */}
                {!gecti && (
                    <p className="mt-3 max-w-sm text-xs leading-relaxed text-muted-foreground">
                        Sınav hakkınız kullanıldı. Yeniden girmek için merkezden hak tanımlanması gerekir.
                    </p>
                )}
            </div>

            {sorular.length > 0 && (
                <div className="space-y-3">
                    <h5 className="text-sm font-semibold text-foreground">Cevaplarınız</h5>
                    {sorular.map((q, i) => (
                        <div key={q.id} className={`rounded-lg border p-4 ${q.dogruMu ? 'bg-background' : 'border-destructive/30 bg-destructive/[0.03]'}`}>
                            <div className="mb-3 flex items-start gap-2">
                                {q.dogruMu
                                    ? <CheckCircle className="mt-0.5 size-4 shrink-0 text-emerald-600" />
                                    : <XCircle className="mt-0.5 size-4 shrink-0 text-destructive" />}
                                <h4 className="font-medium text-foreground">{i + 1}. {q.soru}</h4>
                            </div>
                            <div className="space-y-1.5">
                                {q.secenekler.map((opt) => {
                                    const dogruSik = opt.id === q.dogru;
                                    const secilen = opt.id === q.verilen;
                                    return (
                                        <div
                                            key={opt.id}
                                            className={`flex items-center gap-3 rounded-md border p-2.5 text-sm ${
                                                dogruSik ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/30'
                                                    : secilen ? 'border-destructive/40 bg-destructive/5'
                                                    : 'border-transparent'
                                            }`}
                                        >
                                            <span className="w-4 text-center text-sm font-bold">{opt.id})</span>
                                            <span className="flex-1">{opt.text}</span>
                                            {dogruSik && <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">doğru cevap</span>}
                                            {secilen && !dogruSik && <span className="text-[11px] font-semibold text-destructive">sizin cevabınız</span>}
                                        </div>
                                    );
                                })}
                                {q.verilen == null && (
                                    <p className="text-xs text-muted-foreground">Bu soruyu boş bırakmışsınız.</p>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Sınav ekranı sayfayı doldurduğu için alttaki gezinme çubuğu
                görüş alanının dışında kalıyordu: geçişi buraya da koyuyoruz. */}
            {sonrakiVar && (
                <Button onClick={onSonraki} size="lg" className="w-full">
                    {sonDers && sonrakiKurs ? `Sonraki kurs: ${sonrakiKurs.title}` : 'Sonraki derse geç'}
                    <ChevronRight className="ml-1 size-4" />
                </Button>
            )}
        </div>
    );
}
