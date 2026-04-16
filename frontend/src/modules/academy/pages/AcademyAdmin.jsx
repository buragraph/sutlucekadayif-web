import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Video, FileText, Upload, X, Eye, EyeOff, Users, BarChart3, Search } from 'lucide-react';
import api from '../../../services/api';
import { useToast, useConfirm } from '../../../shared/components/Toast';

export default function AcademyAdmin() {
    const navigate = useNavigate();
    const toast = useToast();
    const confirm = useConfirm();

    // Tab state
    const [activeTab, setActiveTab] = useState('courses');

    // Courses state
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedCourse, setExpandedCourse] = useState(null);
    const [courseLessons, setCourseLessons] = useState({});

    // Stats state
    const [stats, setStats] = useState([]);
    const [statsLoading, setStatsLoading] = useState(false);
    const [statsFetched, setStatsFetched] = useState(false);

    // Stats filter state
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBranch, setSelectedBranch] = useState('');

    // Modal state
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('course');
    const [editingItem, setEditingItem] = useState(null);
    const [activeCourseId, setActiveCourseId] = useState(null);

    // Form state
    const [form, setForm] = useState({ title: '', description: '', lessonType: 'video' });
    const [uploading, setUploading] = useState(false);
    const [uploadedFileUrl, setUploadedFileUrl] = useState('');
    const [uploadedFileName, setUploadedFileName] = useState('');

    // ─── Data Fetching ───
    useEffect(() => { fetchCourses(); }, []);

    useEffect(() => {
        if (activeTab === 'stats' && !statsFetched) fetchStats();
    }, [activeTab]);

    const fetchCourses = async () => {
        try {
            const { data } = await api.get('/academy/courses');
            setCourses(data.courses);
        } catch (err) {
            toast.error('Kurslar yüklenemedi');
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        setStatsLoading(true);
        try {
            const { data } = await api.get('/academy/progress/admin/stats');
            setStats(data.stats);
            setStatsFetched(true);
        } catch (err) {
            toast.error('İstatistikler yüklenemedi');
        } finally {
            setStatsLoading(false);
        }
    };

    const fetchLessons = async (courseId) => {
        try {
            const { data } = await api.get(`/academy/lessons/${courseId}`);
            setCourseLessons(prev => ({ ...prev, [courseId]: data.lessons }));
        } catch (err) {
            toast.error('Dersler yüklenemedi');
        }
    };

    const toggleCourse = (courseId) => {
        if (expandedCourse === courseId) {
            setExpandedCourse(null);
        } else {
            setExpandedCourse(courseId);
            if (!courseLessons[courseId]) fetchLessons(courseId);
        }
    };

    // ─── Course CRUD ───
    const openCourseModal = (course = null) => {
        setModalMode('course');
        setEditingItem(course);
        setForm({ title: course?.title || '', description: course?.description || '' });
        setShowModal(true);
    };

    const saveCourse = async () => {
        if (!form.title.trim()) return toast.error('Kurs başlığı gerekli');
        try {
            if (editingItem) {
                await api.put(`/academy/courses/${editingItem.id}`, form);
                toast.success('Kurs güncellendi');
            } else {
                await api.post('/academy/courses', form);
                toast.success('Kurs oluşturuldu');
            }
            setShowModal(false);
            fetchCourses();
        } catch (err) {
            toast.error('İşlem başarısız');
        }
    };

    const deleteCourse = async (course) => {
        const yes = await confirm(`"${course.title}" kursu silinecek. Bu işlem geri alınamaz.`);
        if (!yes) return;
        try {
            await api.delete(`/academy/courses/${course.id}`);
            toast.success('Kurs silindi');
            if (expandedCourse === course.id) setExpandedCourse(null);
            fetchCourses();
        } catch (err) {
            toast.error('Kurs silinemedi');
        }
    };

    const togglePublish = async (course) => {
        try {
            await api.put(`/academy/courses/${course.id}`, { isPublished: !course.isPublished });
            setCourses(prev => prev.map(c => c.id === course.id ? { ...c, isPublished: !c.isPublished } : c));
            toast.success(course.isPublished ? 'Kurs yayından kaldırıldı' : 'Kurs yayınlandı');
        } catch (err) {
            toast.error('İşlem başarısız');
        }
    };

    // ─── Lesson CRUD ───
    const openLessonModal = (courseId, lesson = null) => {
        setModalMode('lesson');
        setActiveCourseId(courseId);
        setEditingItem(lesson);
        setForm({
            title: lesson?.title || '',
            description: lesson?.description || '',
            lessonType: lesson?.lessonType || 'video',
        });
        setUploadedFileUrl(lesson?.videoUrl || lesson?.pdfUrl || '');
        setUploadedFileName('');
        setShowModal(true);
    };

    const saveLesson = async () => {
        if (!form.title.trim()) return toast.error('Ders başlığı gerekli');
        const payload = {
            title: form.title,
            description: form.description,
            lessonType: form.lessonType,
            videoUrl: form.lessonType === 'video' ? uploadedFileUrl : '',
            pdfUrl: form.lessonType === 'pdf' ? uploadedFileUrl : '',
        };
        try {
            if (editingItem) {
                await api.put(`/academy/lessons/${activeCourseId}/${editingItem.id}`, payload);
                toast.success('Ders güncellendi');
            } else {
                await api.post(`/academy/lessons/${activeCourseId}`, payload);
                toast.success('Ders eklendi');
            }
            setShowModal(false);
            fetchLessons(activeCourseId);
            fetchCourses();
        } catch (err) {
            toast.error('İşlem başarısız');
        }
    };

    const deleteLesson = async (courseId, lesson) => {
        const yes = await confirm(`"${lesson.title}" dersi silinecek.`);
        if (!yes) return;
        try {
            await api.delete(`/academy/lessons/${courseId}/${lesson.id}`);
            toast.success('Ders silindi');
            fetchLessons(courseId);
            fetchCourses();
        } catch (err) {
            toast.error('Ders silinemedi');
        }
    };

    // ─── File Upload ───
    const handleFileUpload = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const { data } = await api.post('/academy/upload/file', formData, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            setUploadedFileUrl(data.url);
            setUploadedFileName(file.name);
            toast.success('Dosya yüklendi');
        } catch (err) {
            toast.error('Dosya yüklenemedi');
        } finally {
            setUploading(false);
        }
    };

    // ─── Helper ───
    const getCourseTitle = (courseId) => {
        const c = courses.find(c => c.id === courseId);
        return c?.title || courseId;
    };

    const formatDate = (dateStr) => {
        if (!dateStr) return '—';
        const d = new Date(dateStr);
        return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    };

    // ─── Render ───
    if (loading) return (
        <div className="page-padding">
            <div className="loading-container"><div className="spinner" /><p className="loading-text">Yükleniyor...</p></div>
        </div>
    );

    return (
        <div className="page-padding">
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button className="icon-btn" onClick={() => navigate('/admin/akademi')} title="Geri">
                    <ArrowLeft size={20} />
                </button>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111', margin: 0 }}>Akademi Dashboard</h1>
                <div style={{ flex: 1 }} />
                {activeTab === 'courses' && (
                    <button className="btn btn--primary" onClick={() => openCourseModal()} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 12px', fontSize: 12 }}>
                        <Plus size={14} /> Yeni Kurs
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div className="academy-tabs">
                <button
                    className={`academy-tab${activeTab === 'courses' ? ' academy-tab--active' : ''}`}
                    onClick={() => setActiveTab('courses')}
                >
                    <Video size={14} /> Kurslar
                </button>
                <button
                    className={`academy-tab${activeTab === 'stats' ? ' academy-tab--active' : ''}`}
                    onClick={() => setActiveTab('stats')}
                >
                    <BarChart3 size={14} /> Kullanıcı İstatistikleri
                </button>
            </div>

            {/* ─── TAB: Courses ─── */}
            {activeTab === 'courses' && (
                <>
                    {courses.length === 0 ? (
                        <div className="empty-state"><div className="icon">📚</div><p>Henüz kurs eklenmemiş</p></div>
                    ) : (
                        <div className="academy-courses">
                            {courses.map(course => (
                                <div key={course.id} className={`academy-course-card${expandedCourse === course.id ? ' academy-course-card--expanded' : ''}`}>
                                    <div className="academy-course-card__header" onClick={() => toggleCourse(course.id)}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                                            {expandedCourse === course.id
                                                ? <ChevronDown size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />
                                                : <ChevronRight size={16} style={{ color: 'var(--color-text-muted)', flexShrink: 0 }} />}
                                            <div style={{ minWidth: 0 }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                                    <span style={{ fontWeight: 600, fontSize: 14 }}>{course.title}</span>
                                                    {course.isPublished ? (
                                                        <span className="academy-badge academy-badge--success">Yayında</span>
                                                    ) : (
                                                        <span className="academy-badge academy-badge--muted">Taslak</span>
                                                    )}
                                                </div>
                                                {course.description && (
                                                    <p style={{ fontSize: 12, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>{course.description}</p>
                                                )}
                                                <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{course.lessonCount || 0} ders</span>
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 2 }} onClick={e => e.stopPropagation()}>
                                            <button className="icon-btn" onClick={() => togglePublish(course)} title={course.isPublished ? 'Yayından kaldır' : 'Yayınla'}>
                                                {course.isPublished ? <EyeOff size={14} /> : <Eye size={14} />}
                                            </button>
                                            <button className="icon-btn" onClick={() => openCourseModal(course)} title="Düzenle">
                                                <Pencil size={14} />
                                            </button>
                                            <button className="icon-btn" onClick={() => deleteCourse(course)} title="Sil" style={{ color: '#e53e3e' }}>
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>

                                    {expandedCourse === course.id && (
                                        <div className="academy-course-card__body">
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dersler</span>
                                                <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                                                <button className="btn btn--secondary" onClick={() => openLessonModal(course.id)} style={{ fontSize: 11, padding: '3px 10px', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Plus size={12} /> Ders Ekle
                                                </button>
                                            </div>

                                            {!courseLessons[course.id] ? (
                                                <div style={{ textAlign: 'center', padding: 16, color: 'var(--color-text-muted)', fontSize: 13 }}>Yükleniyor...</div>
                                            ) : courseLessons[course.id].length === 0 ? (
                                                <div style={{ textAlign: 'center', padding: 20, color: 'var(--color-text-muted)', fontSize: 13 }}>Henüz ders eklenmemiş</div>
                                            ) : (
                                                <div className="academy-lessons-list">
                                                    {courseLessons[course.id].map((lesson, i) => (
                                                        <div key={lesson.id} className="academy-lesson-row">
                                                            <span className="academy-lesson-row__index">{i + 1}</span>
                                                            <div className={`academy-lesson-row__icon ${lesson.lessonType === 'video' ? 'academy-lesson-row__icon--video' : 'academy-lesson-row__icon--pdf'}`}>
                                                                {lesson.lessonType === 'video' ? <Video size={13} /> : <FileText size={13} />}
                                                            </div>
                                                            <div className="academy-lesson-row__content">
                                                                <span className="academy-lesson-row__title">{lesson.title}</span>
                                                                <span className="academy-lesson-row__type">{lesson.lessonType === 'video' ? 'Video' : 'PDF'}</span>
                                                            </div>
                                                            <div style={{ display: 'flex', gap: 2 }}>
                                                                <button className="icon-btn" onClick={() => openLessonModal(course.id, lesson)} title="Düzenle"><Pencil size={12} /></button>
                                                                <button className="icon-btn" onClick={() => deleteLesson(course.id, lesson)} title="Sil" style={{ color: '#e53e3e' }}><Trash2 size={12} /></button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}

            {/* ─── TAB: User Statistics ─── */}
            {activeTab === 'stats' && (
                <div>
                    {statsLoading ? (
                        <div className="loading-container"><div className="spinner" /><p className="loading-text">İstatistikler yükleniyor...</p></div>
                    ) : stats.length === 0 ? (
                        <div className="empty-state"><div className="icon">📊</div><p>Henüz kullanıcı istatistiği yok</p></div>
                    ) : (() => {
                        // Unique branches for filter
                        const branches = [...new Set(stats.map(s => s.subeSlug).filter(Boolean))].sort();

                        // Filter stats
                        const filteredStats = stats.filter(user => {
                            // Name/email search
                            if (searchQuery) {
                                const q = searchQuery.toLowerCase();
                                const matchName = (user.displayName || '').toLowerCase().includes(q);
                                const matchEmail = (user.email || '').toLowerCase().includes(q);
                                if (!matchName && !matchEmail) return false;
                            }
                            // Branch filter
                            if (selectedBranch && user.subeSlug !== selectedBranch) return false;
                            return true;
                        });

                        return (
                        <div className="academy-stats">
                            {/* Summary cards */}
                            <div className="academy-stats-summary">
                                <div className="academy-stat-card">
                                    <div className="academy-stat-card__value">{stats.length}</div>
                                    <div className="academy-stat-card__label">Aktif Kullanıcı</div>
                                </div>
                                <div className="academy-stat-card">
                                    <div className="academy-stat-card__value">{stats.reduce((sum, s) => sum + s.totalCompleted, 0)}</div>
                                    <div className="academy-stat-card__label">Toplam Tamamlanan Ders</div>
                                </div>
                                <div className="academy-stat-card">
                                    <div className="academy-stat-card__value">{courses.length}</div>
                                    <div className="academy-stat-card__label">Toplam Kurs</div>
                                </div>
                            </div>

                            {/* Search & Filter */}
                            <div className="academy-stats-filters">
                                <div className="academy-stats-search">
                                    <Search size={14} />
                                    <input
                                        type="text"
                                        placeholder="İsim veya email ile ara..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="academy-stats-search__input"
                                    />
                                    {searchQuery && (
                                        <button className="icon-btn" onClick={() => setSearchQuery('')} style={{ padding: 2 }}><X size={12} /></button>
                                    )}
                                </div>
                                <select
                                    className="academy-stats-select"
                                    value={selectedBranch}
                                    onChange={e => setSelectedBranch(e.target.value)}
                                >
                                    <option value="">Tüm Şubeler</option>
                                    {branches.map(b => (
                                        <option key={b} value={b}>{b}</option>
                                    ))}
                                </select>
                                {(searchQuery || selectedBranch) && (
                                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)', alignSelf: 'center' }}>
                                        {filteredStats.length} / {stats.length} kullanıcı
                                    </span>
                                )}
                            </div>

                            {/* User table */}
                            <div className="academy-stats-table-wrap">
                                <table className="academy-stats-table">
                                    <thead>
                                        <tr>
                                            <th>Kullanıcı</th>
                                            <th>Şube</th>
                                            {courses.map(c => (
                                                <th key={c.id} title={c.title}>
                                                    <span className="academy-stats-table__course-name">{c.title}</span>
                                                </th>
                                            ))}
                                            <th>Toplam</th>
                                            <th>Son Aktivite</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredStats.map(user => (
                                            <tr key={user.userId}>
                                                <td>
                                                    <div className="academy-stats-user">
                                                        <div className="academy-stats-user__avatar">
                                                            {(user.displayName || user.email || '?')[0].toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="academy-stats-user__name">{user.displayName || '—'}</div>
                                                            <div className="academy-stats-user__email">{user.email || '—'}</div>
                                                        </div>
                                                    </div>
                                                </td>
                                                <td>
                                                    {user.subeSlug ? (
                                                        <span className="academy-badge academy-badge--branch">{user.subeSlug}</span>
                                                    ) : (
                                                        <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>—</span>
                                                    )}
                                                </td>
                                                {courses.map(c => {
                                                    const courseData = user.byCourse[c.id];
                                                    const count = courseData?.count || 0;
                                                    const total = c.lessonCount || 0;
                                                    const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                                                    return (
                                                        <td key={c.id}>
                                                            {count > 0 ? (
                                                                <div className="academy-stats-progress-cell">
                                                                    <div className="academy-progress-bar" style={{ width: 60 }}>
                                                                        <div className="academy-progress-bar__fill" style={{ width: `${pct}%` }} />
                                                                    </div>
                                                                    <span className={`academy-stats-pct${pct === 100 ? ' academy-stats-pct--done' : ''}`}>
                                                                        {pct === 100 ? '✓' : `%${pct}`}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <span style={{ color: 'var(--color-text-muted)', fontSize: 11 }}>—</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                                <td>
                                                    <span style={{ fontWeight: 600, fontSize: 13 }}>{user.totalCompleted}</span>
                                                </td>
                                                <td>
                                                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{formatDate(user.lastActivity)}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        );
                    })()}
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-card" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>
                                {modalMode === 'course'
                                    ? (editingItem ? 'Kurs Düzenle' : 'Yeni Kurs')
                                    : (editingItem ? 'Ders Düzenle' : 'Yeni Ders')}
                            </h2>
                            <button className="modal-close" onClick={() => setShowModal(false)}><X size={18} /></button>
                        </div>
                        <div className="modal-form">
                            <div className="form-group">
                                <label className="form-label">{modalMode === 'course' ? 'Kurs Başlığı' : 'Ders Başlığı'}</label>
                                <input className="form-input" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={modalMode === 'course' ? 'Kurs adı...' : 'Ders adı...'} autoFocus />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Açıklama</label>
                                <textarea className="form-input" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Açıklama..." rows={3} style={{ resize: 'vertical', height: 'auto' }} />
                            </div>
                            {modalMode === 'lesson' && (
                                <>
                                    <div className="form-group">
                                        <label className="form-label">Ders Tipi</label>
                                        <div style={{ display: 'flex', gap: 8 }}>
                                            {['video', 'pdf'].map(type => (
                                                <button key={type} className={`btn ${form.lessonType === type ? 'btn--primary' : 'btn--secondary'}`} onClick={() => { setForm(f => ({ ...f, lessonType: type })); setUploadedFileUrl(''); setUploadedFileName(''); }} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', fontSize: 13 }}>
                                                    {type === 'video' ? <Video size={16} /> : <FileText size={16} />}
                                                    {type === 'video' ? 'Video' : 'PDF'}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">{form.lessonType === 'video' ? 'Video Dosyası' : 'PDF Dosyası'}</label>
                                        {uploadedFileUrl ? (
                                            <div className="academy-file-indicator">
                                                {form.lessonType === 'video' ? <Video size={14} /> : <FileText size={14} />}
                                                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{uploadedFileName || 'Dosya yüklü ✓'}</span>
                                                <button className="icon-btn" onClick={() => { setUploadedFileUrl(''); setUploadedFileName(''); }} style={{ padding: 2 }}><X size={12} /></button>
                                            </div>
                                        ) : (
                                            <label className="academy-upload-area">
                                                <input type="file" accept={form.lessonType === 'video' ? 'video/mp4,video/webm,video/quicktime' : 'application/pdf'} onChange={handleFileUpload} style={{ display: 'none' }} disabled={uploading} />
                                                {uploading ? (
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="spinner" style={{ width: 16, height: 16 }} /><span>Yükleniyor...</span></div>
                                                ) : (
                                                    <>
                                                        <Upload size={20} style={{ color: 'var(--color-text-muted)' }} />
                                                        <span>{form.lessonType === 'video' ? 'Video yükle (MP4, WebM)' : 'PDF yükle'}</span>
                                                        <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>Maks. 100MB</span>
                                                    </>
                                                )}
                                            </label>
                                        )}
                                    </div>
                                </>
                            )}
                            <div className="modal-actions">
                                <button className="btn btn--secondary" onClick={() => setShowModal(false)}>İptal</button>
                                <button className="btn btn--primary" onClick={modalMode === 'course' ? saveCourse : saveLesson} disabled={uploading}>
                                    {editingItem ? 'Kaydet' : 'Oluştur'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
