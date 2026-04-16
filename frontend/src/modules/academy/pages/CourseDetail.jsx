import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Video, FileText, CheckCircle, Circle, ChevronLeft, ChevronRight } from 'lucide-react';
import api from '../../../services/api';
import { useToast } from '../../../shared/components/Toast';

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

    useEffect(() => { fetchCourseData(); }, [courseId]);

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
        } catch (err) {
            toast.error('Kurs verileri yüklenemedi');
        } finally {
            setLoading(false);
        }
    };

    const toggleComplete = async () => {
        if (!currentLesson) return;
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
        } catch (err) {
            toast.error('İşlem başarısız');
        } finally {
            setCompleting(false);
        }
    };

    const goToNextLesson = () => {
        const idx = lessons.findIndex(l => l.id === currentLesson?.id);
        if (idx < lessons.length - 1) setCurrentLesson(lessons[idx + 1]);
    };

    const goToPrevLesson = () => {
        const idx = lessons.findIndex(l => l.id === currentLesson?.id);
        if (idx > 0) setCurrentLesson(lessons[idx - 1]);
    };

    if (loading) return (
        <div className="page-padding">
            <div className="loading-container"><div className="spinner" /><p className="loading-text">Yükleniyor...</p></div>
        </div>
    );

    if (!course) return (
        <div className="page-padding"><div className="empty-state"><p>Kurs bulunamadı</p></div></div>
    );

    const currentIdx = lessons.findIndex(l => l.id === currentLesson?.id);
    const completedCount = Object.keys(completed).length;
    const totalCount = lessons.length;
    const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

    return (
        <div className="page-padding">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button className="icon-btn" onClick={() => navigate('/admin/akademi')} title="Geri">
                    <ArrowLeft size={20} />
                </button>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <h1 style={{ fontSize: 20, fontWeight: 700, color: '#111', margin: 0 }}>{course.title}</h1>
                    {course.description && (
                        <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>{course.description}</p>
                    )}
                </div>
                {/* Progress badge */}
                <div className="academy-progress-badge">
                    <span style={{ fontWeight: 600 }}>%{progressPct}</span>
                    <span style={{ color: 'var(--color-text-muted)' }}>{completedCount}/{totalCount}</span>
                </div>
            </div>

            {lessons.length === 0 ? (
                <div className="empty-state" style={{ padding: 60 }}>
                    <div className="icon">📚</div><p>Bu kursta henüz ders yok</p>
                </div>
            ) : (
                <div className="academy-detail-layout">
                    {/* Main Content */}
                    <div className="academy-detail-main">
                        {currentLesson && (
                            <>
                                {/* Video / PDF Viewer */}
                                <div className="academy-viewer">
                                    {currentLesson.lessonType === 'video' ? (
                                        currentLesson.videoUrl ? (
                                            <video key={currentLesson.id} controls className="academy-video-player" src={currentLesson.videoUrl}>
                                                Tarayıcınız video oynatmayı desteklemiyor.
                                            </video>
                                        ) : (
                                            <div className="academy-viewer-empty">
                                                <Video size={40} /><p>Video henüz yüklenmemiş</p>
                                            </div>
                                        )
                                    ) : (
                                        currentLesson.pdfUrl ? (
                                            <iframe key={currentLesson.id} src={currentLesson.pdfUrl} className="academy-pdf-viewer" title={currentLesson.title} />
                                        ) : (
                                            <div className="academy-viewer-empty">
                                                <FileText size={40} /><p>PDF henüz yüklenmemiş</p>
                                            </div>
                                        )
                                    )}
                                </div>

                                {/* Lesson Info + Actions */}
                                <div className="academy-lesson-info">
                                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div className={`academy-lesson-row__icon ${currentLesson.lessonType === 'video' ? 'academy-lesson-row__icon--video' : 'academy-lesson-row__icon--pdf'}`} style={{ width: 32, height: 32 }}>
                                                {currentLesson.lessonType === 'video' ? <Video size={16} /> : <FileText size={16} />}
                                            </div>
                                            <div>
                                                <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>{currentLesson.title}</h2>
                                                <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
                                                    {currentLesson.lessonType === 'video' ? 'Video' : 'PDF'} • Ders {currentIdx + 1}/{lessons.length}
                                                </span>
                                            </div>
                                        </div>
                                        {/* Complete Button */}
                                        <button
                                            className={`btn ${completed[currentLesson.id] ? 'academy-btn-completed' : 'btn--primary'}`}
                                            onClick={toggleComplete}
                                            disabled={completing}
                                            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 14px', whiteSpace: 'nowrap' }}
                                        >
                                            {completed[currentLesson.id] ? (
                                                <><CheckCircle size={14} /> Tamamlandı</>
                                            ) : (
                                                <><Circle size={14} /> Tamamla</>
                                            )}
                                        </button>
                                    </div>
                                    <div style={{ display: 'flex', gap: 6, marginTop: 12 }}>
                                        <button className="btn btn--secondary" onClick={goToPrevLesson} disabled={currentIdx <= 0} style={{ fontSize: 12, padding: '5px 12px' }}>
                                            <ChevronLeft size={14} /> Önceki
                                        </button>
                                        <button className="btn btn--primary" onClick={goToNextLesson} disabled={currentIdx >= lessons.length - 1} style={{ fontSize: 12, padding: '5px 12px' }}>
                                            Sonraki <ChevronRight size={14} />
                                        </button>
                                    </div>
                                </div>

                                {currentLesson.description && (
                                    <div style={{ padding: '12px 16px', background: 'var(--color-surface)', borderRadius: 'var(--radius-md)', fontSize: 13, color: 'var(--color-text-secondary)', marginTop: 12 }}>
                                        {currentLesson.description}
                                    </div>
                                )}
                            </>
                        )}
                    </div>

                    {/* Sidebar */}
                    <div className="academy-detail-sidebar">
                        {/* Progress Card */}
                        <div className="academy-sidebar-card" style={{ marginBottom: 12 }}>
                            <div className="academy-sidebar-card__header">
                                <span>İlerleme</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: progressPct === 100 ? '#059669' : 'var(--color-text)' }}>%{progressPct}</span>
                            </div>
                            <div style={{ padding: '12px 16px' }}>
                                <div className="academy-progress-bar">
                                    <div className="academy-progress-bar__fill" style={{ width: `${progressPct}%` }} />
                                </div>
                                <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 6 }}>
                                    {completedCount} / {totalCount} ders tamamlandı
                                </p>
                            </div>
                        </div>

                        {/* Lesson List */}
                        <div className="academy-sidebar-card">
                            <div className="academy-sidebar-card__header">
                                <span>İçerik</span>
                                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{lessons.length} ders</span>
                            </div>
                            <div className="academy-sidebar-lessons">
                                {lessons.map((lesson, i) => (
                                    <div
                                        key={lesson.id}
                                        className={`academy-sidebar-lesson${currentLesson?.id === lesson.id ? ' academy-sidebar-lesson--active' : ''}`}
                                        onClick={() => setCurrentLesson(lesson)}
                                    >
                                        {/* Completion indicator */}
                                        {completed[lesson.id] ? (
                                            <CheckCircle size={14} style={{ color: '#059669', flexShrink: 0 }} />
                                        ) : (
                                            <span className="academy-sidebar-lesson__num">{i + 1}</span>
                                        )}
                                        <div className={`academy-lesson-row__icon ${lesson.lessonType === 'video' ? 'academy-lesson-row__icon--video' : 'academy-lesson-row__icon--pdf'}`} style={{ width: 24, height: 24 }}>
                                            {lesson.lessonType === 'video' ? <Video size={11} /> : <FileText size={11} />}
                                        </div>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontSize: 13,
                                                fontWeight: 500,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                textDecoration: completed[lesson.id] ? 'line-through' : 'none',
                                                color: completed[lesson.id] ? 'var(--color-text-muted)' : 'var(--color-text)',
                                            }}>
                                                {lesson.title}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                                                {lesson.lessonType === 'video' ? 'Video' : 'PDF'}
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
