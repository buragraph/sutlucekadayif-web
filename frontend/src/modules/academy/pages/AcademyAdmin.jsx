import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Video, FileText, Upload, X, Eye, EyeOff, Users, BarChart3, Search, Check, HelpCircle, ArrowUp, ArrowDown } from 'lucide-react';
import api from '../../../services/api';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';

export default function AcademyAdmin() {
    const navigate = useNavigate();
    const toast = useToast();
    const confirm = useConfirm();
    const [activeTab, setActiveTab] = useState('courses');
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedCourse, setExpandedCourse] = useState(null);
    const [courseLessons, setCourseLessons] = useState({});
    const [stats, setStats] = useState([]);
    const [statsLoading, setStatsLoading] = useState(false);
    const [statsFetched, setStatsFetched] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBranch, setSelectedBranch] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [showModal, setShowModal] = useState(false);
    const [modalMode, setModalMode] = useState('course');
    const [editingItem, setEditingItem] = useState(null);
    const [activeCourseId, setActiveCourseId] = useState(null);
    const [form, setForm] = useState({ title: '', description: '', lessonType: 'video', passingScore: 70, questions: [] });
    const [uploading, setUploading] = useState(false);
    const [uploadedFileUrl, setUploadedFileUrl] = useState('');
    const [uploadedFileName, setUploadedFileName] = useState('');

    useEffect(() => { fetchCourses(); }, []);
    useEffect(() => { if (activeTab === 'stats' && !statsFetched) fetchStats(); }, [activeTab]);
    useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedBranch]);

    const fetchCourses = async () => {
        try { const { data } = await api.get('/academy/courses'); setCourses(data.courses); }
        catch { toast.error('Kurslar yüklenemedi'); }
        finally { setLoading(false); }
    };
    const fetchStats = async () => {
        setStatsLoading(true);
        try { const { data } = await api.get('/academy/progress/admin/stats'); setStats(data.stats); setStatsFetched(true); }
        catch { toast.error('İstatistikler yüklenemedi'); }
        finally { setStatsLoading(false); }
    };
    const fetchLessons = async (courseId) => {
        try { const { data } = await api.get(`/academy/lessons/${courseId}`); setCourseLessons(prev => ({ ...prev, [courseId]: data.lessons })); }
        catch { toast.error('Dersler yüklenemedi'); }
    };
    const toggleCourse = (courseId) => {
        if (expandedCourse === courseId) { setExpandedCourse(null); }
        else { setExpandedCourse(courseId); if (!courseLessons[courseId]) fetchLessons(courseId); }
    };
    const openCourseModal = (course = null) => { setModalMode('course'); setEditingItem(course); setForm({ title: course?.title || '', description: course?.description || '' }); setShowModal(true); };
    const saveCourse = async () => {
        if (!form.title.trim()) return toast.error('Kurs başlığı gerekli');
        try {
            if (editingItem) { await api.put(`/academy/courses/${editingItem.id}`, form); toast.success('Kurs güncellendi'); }
            else { await api.post('/academy/courses', form); toast.success('Kurs oluşturuldu'); }
            setShowModal(false); fetchCourses();
        } catch { toast.error('İşlem başarısız'); }
    };
    const deleteCourse = async (course) => {
        const yes = await confirm(`"${course.title}" kursu silinecek. Bu işlem geri alınamaz.`);
        if (!yes) return;
        try { await api.delete(`/academy/courses/${course.id}`); toast.success('Kurs silindi'); if (expandedCourse === course.id) setExpandedCourse(null); fetchCourses(); }
        catch { toast.error('Kurs silinemedi'); }
    };
    const togglePublish = async (course) => {
        try { await api.put(`/academy/courses/${course.id}`, { isPublished: !course.isPublished }); setCourses(prev => prev.map(c => c.id === course.id ? { ...c, isPublished: !c.isPublished } : c)); toast.success(course.isPublished ? 'Kurs yayından kaldırıldı' : 'Kurs yayınlandı'); }
        catch { toast.error('İşlem başarısız'); }
    };
    const openLessonModal = (courseId, lesson = null) => {
        setModalMode('lesson'); setActiveCourseId(courseId); setEditingItem(lesson);
        setForm({ 
            title: lesson?.title || '', 
            description: lesson?.description || '', 
            lessonType: lesson?.lessonType || 'video',
            passingScore: lesson?.passingScore || 70,
            questions: lesson?.questions || []
        });
        setUploadedFileUrl(lesson?.videoUrl || lesson?.pdfUrl || ''); setUploadedFileName(''); setShowModal(true);
    };
    const saveLesson = async () => {
        if (!form.title.trim()) return toast.error('Ders başlığı gerekli');
        if (form.lessonType === 'quiz') {
            if (!form.questions || form.questions.length === 0) return toast.error('Sınav için en az bir soru eklemelisiniz');
            for (let i = 0; i < form.questions.length; i++) {
                const q = form.questions[i];
                if (!q.questionText?.trim()) return toast.error(`${i+1}. sorunun metni boş olamaz`);
                if (!q.correctOptionId) return toast.error(`${i+1}. soru için doğru cevap seçmelisiniz`);
                if (!q.options || q.options.length < 2) return toast.error(`${i+1}. soru için en az 2 şık eklemelisiniz`);
                for (let j = 0; j < q.options.length; j++) {
                    if (!q.options[j].text?.trim()) return toast.error(`${i+1}. sorunun ${q.options[j].id} şıkkı boş olamaz`);
                }
            }
        }
        
        const payload = { 
            title: form.title, 
            description: form.description, 
            lessonType: form.lessonType, 
            videoUrl: form.lessonType === 'video' ? uploadedFileUrl : '', 
            pdfUrl: form.lessonType === 'pdf' ? uploadedFileUrl : '',
            passingScore: form.lessonType === 'quiz' ? Number(form.passingScore) : null,
            questions: form.lessonType === 'quiz' ? form.questions : null
        };
        try {
            if (editingItem) { await api.put(`/academy/lessons/${activeCourseId}/${editingItem.id}`, payload); toast.success('Ders güncellendi'); }
            else { await api.post(`/academy/lessons/${activeCourseId}`, payload); toast.success('Ders eklendi'); }
            setShowModal(false); fetchLessons(activeCourseId); fetchCourses();
        } catch { toast.error('İşlem başarısız'); }
    };
    const deleteLesson = async (courseId, lesson) => {
        const yes = await confirm(`"${lesson.title}" dersi silinecek.`);
        if (!yes) return;
        try { await api.delete(`/academy/lessons/${courseId}/${lesson.id}`); toast.success('Ders silindi'); fetchLessons(courseId); fetchCourses(); }
        catch { toast.error('Ders silinemedi'); }
    };
    const moveLesson = async (courseId, index, direction) => {
        const lessons = [...(courseLessons[courseId] || [])];
        if (direction === 'up' && index > 0) {
            [lessons[index], lessons[index - 1]] = [lessons[index - 1], lessons[index]];
        } else if (direction === 'down' && index < lessons.length - 1) {
            [lessons[index], lessons[index + 1]] = [lessons[index + 1], lessons[index]];
        } else {
            return;
        }
        setCourseLessons(prev => ({ ...prev, [courseId]: lessons }));
        const order = lessons.map((l, idx) => ({ id: l.id, orderIndex: idx }));
        try {
            await api.put(`/academy/lessons/${courseId}/reorder`, { order });
            toast.success('Sıralama güncellendi');
        } catch {
            toast.error('Sıralama güncellenemedi');
            fetchLessons(courseId);
        }
    };
    const handleFileUpload = async (e) => {
        const file = e.target.files[0]; if (!file) return;
        setUploading(true);
        try { const formData = new FormData(); formData.append('file', file); const { data } = await api.post('/academy/upload/file', formData, { headers: { 'Content-Type': 'multipart/form-data' } }); setUploadedFileUrl(data.url); setUploadedFileName(file.name); toast.success('Dosya yüklendi'); }
        catch { toast.error('Dosya yüklenemedi'); }
        finally { setUploading(false); }
    };
    const formatDate = (dateStr) => { if (!dateStr) return '—'; return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };

    if (loading) return <div className="flex flex-col items-center justify-center gap-3 py-16"><Spinner className="size-8" /><p className="text-sm text-muted-foreground">Yükleniyor...</p></div>;

    return (
        <div className="flex flex-1 flex-col gap-4 w-full h-full min-h-0">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
                <div className="flex items-center gap-3">
                    <Button variant="outline" size="icon" className="size-8 shrink-0 shadow-sm" onClick={() => navigate('/admin/akademi')}>
                        <ArrowLeft className="size-4" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold tracking-tight text-foreground">Akademi Yönetimi</h1>
                        <p className="text-xs text-muted-foreground mt-0.5">Eğitim içeriklerini ve kullanıcı istatistiklerini yönetin.</p>
                    </div>
                </div>
                {activeTab === 'courses' && (
                    <Button size="sm" className="h-8 shadow-sm bg-primary hover:bg-primary/90 text-primary-foreground text-xs" onClick={() => openCourseModal()}>
                        <Plus className="size-3.5 mr-1.5" /> Yeni Kurs
                    </Button>
                )}
            </div>

            {/* Tabs */}
            <div className="flex gap-4 shrink-0 border-b border-border/60">
                <button
                    className={`flex items-center gap-2 px-1 py-2 text-sm font-medium transition-colors relative ${activeTab === 'courses' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setActiveTab('courses')}
                >
                    <Video className="size-4" /> Kurslar
                    {activeTab === 'courses' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
                </button>
                <button
                    className={`flex items-center gap-2 px-1 py-2 text-sm font-medium transition-colors relative ${activeTab === 'stats' ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                    onClick={() => setActiveTab('stats')}
                >
                    <BarChart3 className="size-4" /> Kullanıcı İstatistikleri
                    {activeTab === 'stats' && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full" />}
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 min-h-0 overflow-y-auto pb-4">
                {/* Courses Tab */}
                {activeTab === 'courses' && (
                    <>
                        {courses.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground border border-dashed rounded-lg bg-card">
                                <span className="text-4xl opacity-50">📚</span>
                                <div className="text-center">
                                    <p className="text-sm font-medium text-foreground">Henüz kurs eklenmemiş</p>
                                    <p className="text-xs text-muted-foreground mt-1">İlk kursunuzu oluşturarak eğitime başlayın.</p>
                                </div>
                                <Button size="sm" variant="outline" className="mt-1 text-xs" onClick={() => openCourseModal()}>
                                    <Plus className="size-3.5 mr-1.5" /> Yeni Kurs
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {courses.map(course => (
                                    <div key={course.id} className={`rounded-xl border bg-card transition-all overflow-hidden ${expandedCourse === course.id ? 'border-border shadow-sm' : 'hover:border-primary/20'}`}>
                                        <div className="flex cursor-pointer items-center gap-3 p-4" onClick={() => toggleCourse(course.id)}>
                                            <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted/50 text-muted-foreground transition-transform">
                                                {expandedCourse === course.id ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                            </div>
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                                    <span className="text-sm font-semibold text-foreground">{course.title}</span>
                                                    <Badge variant={course.isPublished ? 'default' : 'secondary'} className={`text-[10px] font-medium ${course.isPublished ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100' : ''}`}>
                                                        {course.isPublished ? 'Yayında' : 'Taslak'}
                                                    </Badge>
                                                </div>
                                                {course.description && <p className="text-xs text-muted-foreground line-clamp-1">{course.description}</p>}
                                            </div>
                                            <div className="flex items-center gap-4">
                                                <span className="text-xs font-medium text-muted-foreground bg-muted/50 px-2 py-1 rounded-md">{course.lessonCount || 0} ders</span>
                                                <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                                                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => togglePublish(course)} title={course.isPublished ? 'Yayından kaldır' : 'Yayınla'}>
                                                        {course.isPublished ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => openCourseModal(course)} title="Düzenle">
                                                        <Pencil className="size-4" />
                                                    </Button>
                                                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => deleteCourse(course)} title="Sil">
                                                        <Trash2 className="size-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </div>
                                        
                                        {/* Lessons Area */}
                                        {expandedCourse === course.id && (
                                            <div className="border-t bg-muted/10 px-4 py-4 rounded-b-xl">
                                                <div className="mb-3 flex items-center justify-between">
                                                    <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5"><Video className="size-3.5" /> Ders İçerikleri</h4>
                                                    <Button variant="outline" size="sm" className="h-7 text-xs bg-card shadow-sm" onClick={() => openLessonModal(course.id)}>
                                                        <Plus className="size-3 mr-1" /> Ders Ekle
                                                    </Button>
                                                </div>
                                                {!courseLessons[course.id] ? (
                                                    <div className="py-6 flex justify-center"><Spinner className="size-5 text-muted-foreground" /></div>
                                                ) : courseLessons[course.id].length === 0 ? (
                                                    <div className="py-8 text-center border border-dashed rounded-lg bg-card">
                                                        <p className="text-xs font-medium text-muted-foreground">Bu kursta henüz ders yok</p>
                                                    </div>
                                                ) : (
                                                    <div className="space-y-1.5">
                                                        {courseLessons[course.id].map((lesson, i) => (
                                                            <div key={lesson.id} className="group flex items-center gap-3 rounded-lg border bg-card px-3 py-2.5 hover:shadow-sm transition-all">
                                                                <div className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-semibold text-muted-foreground shrink-0">{i + 1}</div>
                                                                <div className={`flex size-8 shrink-0 items-center justify-center rounded-md ${lesson.lessonType === 'video' ? 'bg-blue-50 text-blue-600' : lesson.lessonType === 'pdf' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                                                    {lesson.lessonType === 'video' ? <Video className="size-4" /> : lesson.lessonType === 'pdf' ? <FileText className="size-4" /> : <HelpCircle className="size-4" />}
                                                                </div>
                                                                <div className="min-w-0 flex-1">
                                                                    <div className="text-sm font-medium text-foreground truncate">{lesson.title}</div>
                                                                    <div className="text-[11px] font-medium text-muted-foreground mt-0.5">{lesson.lessonType === 'video' ? 'Video İçerik' : lesson.lessonType === 'pdf' ? 'PDF Doküman' : 'Sınav'}</div>
                                                                </div>
                                                                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                                                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => moveLesson(course.id, i, 'up')} disabled={i === 0} title="Yukarı taşı">
                                                                        <ArrowUp className="size-3.5" />
                                                                    </Button>
                                                                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => moveLesson(course.id, i, 'down')} disabled={i === courseLessons[course.id].length - 1} title="Aşağı taşı">
                                                                        <ArrowDown className="size-3.5" />
                                                                    </Button>
                                                                    <div className="w-px h-4 bg-border mx-1 self-center" />
                                                                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" onClick={() => openLessonModal(course.id, lesson)} title="Düzenle">
                                                                        <Pencil className="size-3.5" />
                                                                    </Button>
                                                                    <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" onClick={() => deleteLesson(course.id, lesson)} title="Sil">
                                                                        <Trash2 className="size-3.5" />
                                                                    </Button>
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

                {/* Stats Tab */}
                {activeTab === 'stats' && (
                    <div>
                        {statsLoading ? (
                            <div className="flex flex-col items-center justify-center gap-3 py-16"><Spinner className="size-8" /><p className="text-sm text-muted-foreground">İstatistikler yükleniyor...</p></div>
                        ) : !stats || stats.length === 0 ? (
                            <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground border border-dashed rounded-lg bg-card">
                                <BarChart3 className="size-10 text-muted-foreground/40" />
                                <div className="text-center">
                                    <p className="text-sm font-medium text-foreground">Kullanıcı istatistiği yok</p>
                                    <p className="text-xs text-muted-foreground mt-1">Sistemde henüz aktif kurs alan kullanıcı bulunmuyor.</p>
                                </div>
                            </div>
                        ) : (() => {
                            const validStats = Array.isArray(stats) ? stats : [];
                            const branches = [...new Set(validStats.map(s => s?.subeSlug).filter(Boolean))].sort();
                            const filteredStats = validStats.filter(user => {
                                if (!user) return false;
                                if (searchQuery) { 
                                    const q = searchQuery.toLowerCase(); 
                                    if (!(user.displayName || '').toLowerCase().includes(q) && !(user.email || '').toLowerCase().includes(q)) return false; 
                                }
                                if (selectedBranch && user.subeSlug !== selectedBranch) return false;
                                return true;
                            });
                            const totalPages = Math.ceil(filteredStats.length / itemsPerPage) || 1;
                            const currentStats = filteredStats.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

                            return (
                                <div className="space-y-4">
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        {[{ val: validStats.length, label: 'Aktif Kullanıcı', icon: Users, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' }, 
                                          { val: validStats.reduce((s, u) => s + (u?.totalCompleted || 0), 0), label: 'Tamamlanan Ders', icon: Check, color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-100' }, 
                                          { val: (courses || []).length, label: 'Toplam Kurs', icon: Video, color: 'text-indigo-600', bg: 'bg-indigo-50 border-indigo-100' }].map(s => (
                                            <div key={s.label} className={`rounded-xl border ${s.bg} p-4 flex items-center gap-4`}>
                                                <div className={`flex size-12 items-center justify-center rounded-lg bg-white shadow-sm border ${s.color}`}>
                                                    <s.icon className="size-6" />
                                                </div>
                                                <div>
                                                    <div className="text-2xl font-bold text-foreground leading-none mb-1">{s.val}</div>
                                                    <div className="text-xs font-medium text-muted-foreground">{s.label}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                    
                                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 bg-card p-3 rounded-lg border">
                                        <div className="relative flex-1">
                                            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                            <Input placeholder="İsim veya e-posta ile ara..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-9" />
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <select className="h-9 rounded-md border border-input bg-background px-3 text-sm min-w-[160px]" value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}>
                                                <option value="">Tüm Şubeler</option>
                                                {branches.map(b => <option key={b} value={b}>{b}</option>)}
                                            </select>
                                            {(searchQuery || selectedBranch) && <Badge variant="secondary" className="h-6">Sonuç: {filteredStats.length}</Badge>}
                                        </div>
                                    </div>
                                    
                                    <div className="rounded-xl border bg-card overflow-hidden">
                                        <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader className="bg-muted/30">
                                                <TableRow>
                                                    <TableHead className="py-3 font-semibold w-1/3 min-w-[250px] pl-6">Kullanıcı</TableHead>
                                                    <TableHead className="py-3 font-semibold text-center w-[120px]">Şube</TableHead>
                                                    {(courses || []).map(c => <TableHead key={c.id} className="text-center py-3 font-semibold min-w-[150px] w-auto"><span className="inline-block max-w-[120px] truncate text-xs uppercase tracking-wider" title={c?.title}>{c?.title || 'Kurs'}</span></TableHead>)}
                                                    <TableHead className="text-center py-3 font-semibold w-[120px]">Toplam</TableHead>
                                                    <TableHead className="text-right py-3 font-semibold w-[150px] pr-6">Son Aktivite</TableHead>
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {currentStats.map(user => {
                                                    const displayChar = (user?.displayName || user?.email || '?')[0]?.toUpperCase() || '?';
                                                    return (
                                                    <TableRow key={user?.userId || Math.random()} className="hover:bg-muted/10">
                                                        <TableCell className="py-3 pl-6">
                                                            <div className="flex items-center gap-3">
                                                                <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary ring-1 ring-primary/20">{displayChar}</div>
                                                                <div className="min-w-0">
                                                                    <div className="text-sm font-medium text-foreground truncate">{user?.displayName || 'İsimsiz Kullanıcı'}</div>
                                                                    <div className="text-[11px] text-muted-foreground truncate">{user?.email || '—'}</div>
                                                                </div>
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="py-3 text-center">{user?.subeSlug ? <Badge variant="outline" className="text-[10px] font-medium border-muted-foreground/20">{user.subeSlug}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                                                        {(courses || []).map(c => {
                                                            const byCourseData = user?.byCourse || {};
                                                            const count = byCourseData[c.id]?.count || 0;
                                                            const total = c?.lessonCount || 0;
                                                            const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                                                            return (
                                                                <TableCell key={c.id} className="text-center py-3">
                                                                    {count > 0 ? (
                                                                        <div className="flex flex-col items-center justify-center gap-1.5 h-full">
                                                                            {pct === 100 ? (
                                                                                <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100/80 border-0 shadow-none px-2 py-0.5 text-[10px]"><Check className="size-3 mr-1" /> TAMAMLANDI</Badge>
                                                                            ) : (
                                                                                <>
                                                                                    <span className="text-[11px] font-bold text-foreground">% {pct}</span>
                                                                                    <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted/50 ring-1 ring-inset ring-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} /></div>
                                                                                </>
                                                                            )}
                                                                        </div>
                                                                    ) : <span className="text-xs text-muted-foreground/50">—</span>}
                                                                </TableCell>
                                                            );
                                                        })}
                                                        <TableCell className="text-center py-3">
                                                            <div className="inline-flex size-7 items-center justify-center rounded bg-muted/50 text-xs font-bold text-foreground">
                                                                {user?.totalCompleted || 0}
                                                            </div>
                                                        </TableCell>
                                                        <TableCell className="text-right text-xs text-muted-foreground py-3 pr-6">{formatDate(user?.lastActivity)}</TableCell>
                                                    </TableRow>
                                                )})}
                                            </TableBody>
                                        </Table>
                                        </div>
                                    </div>
                                    
                                    {totalPages > 1 && (
                                        <div className="flex items-center justify-between bg-card p-3 rounded-lg border">
                                            <p className="text-xs text-muted-foreground ml-1">
                                                Toplam {filteredStats.length} kayıttan {(currentPage - 1) * itemsPerPage + 1}-{Math.min(currentPage * itemsPerPage, filteredStats.length)} arası gösteriliyor
                                            </p>
                                            <div className="flex items-center gap-1">
                                                <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Önceki</Button>
                                                <div className="flex items-center gap-1 px-2">
                                                    {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                                        <button 
                                                            key={page} 
                                                            onClick={() => setCurrentPage(page)}
                                                            className={`size-7 text-xs font-medium rounded-md flex items-center justify-center transition-colors ${currentPage === page ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}
                                                        >
                                                            {page}
                                                        </button>
                                                    ))}
                                                </div>
                                                <Button variant="outline" size="sm" className="h-8" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Sonraki</Button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>

            {/* Modal */}
            <Dialog open={showModal} onOpenChange={(open) => !open && setShowModal(false)}>
                <DialogContent className="sm:max-w-md p-0 gap-0 border overflow-hidden">
                    <DialogHeader className="px-5 py-4 border-b bg-card">
                        <DialogTitle className="text-sm font-medium">
                            {modalMode === 'course' ? (editingItem ? 'Kurs Düzenle' : 'Yeni Kurs') : (editingItem ? 'Ders Düzenle' : 'Yeni Ders')}
                        </DialogTitle>
                    </DialogHeader>
                    <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto max-h-[65vh]">
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">{modalMode === 'course' ? 'Kurs Başlığı' : 'Ders Başlığı'}</Label>
                            <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder={modalMode === 'course' ? 'Örn: Barista Eğitimi 101' : 'Örn: Espresso Nasıl Hazırlanır?'} autoFocus className="h-9" />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="text-xs font-medium">Açıklama</Label>
                            <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Kısa açıklama girin..." rows={3} className="resize-none" />
                        </div>
                        
                        {modalMode === 'lesson' && (
                            <>
                                <div className="space-y-1.5">
                                    <Label className="text-xs font-medium">Ders Formatı</Label>
                                    <div className="grid grid-cols-3 gap-2">
                                        <button type="button" onClick={() => { setForm(f => ({ ...f, lessonType: 'video' })); setUploadedFileUrl(''); setUploadedFileName(''); }}
                                            className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border transition-colors ${form.lessonType === 'video' ? 'border-blue-300 bg-blue-50 text-blue-700 ring-1 ring-blue-500/20' : 'border-border bg-card text-muted-foreground hover:bg-muted/50'}`}>
                                            <Video className="size-5" />
                                            <span className="text-xs font-medium">Video</span>
                                        </button>
                                        <button type="button" onClick={() => { setForm(f => ({ ...f, lessonType: 'pdf' })); setUploadedFileUrl(''); setUploadedFileName(''); }}
                                            className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border transition-colors ${form.lessonType === 'pdf' ? 'border-amber-300 bg-amber-50 text-amber-700 ring-1 ring-amber-500/20' : 'border-border bg-card text-muted-foreground hover:bg-muted/50'}`}>
                                            <FileText className="size-5" />
                                            <span className="text-xs font-medium">PDF Doküman</span>
                                        </button>
                                        <button type="button" onClick={() => { setForm(f => ({ ...f, lessonType: 'quiz' })); setUploadedFileUrl(''); setUploadedFileName(''); }}
                                            className={`flex flex-col items-center justify-center gap-1.5 p-3 rounded-lg border transition-colors ${form.lessonType === 'quiz' ? 'border-emerald-300 bg-emerald-50 text-emerald-700 ring-1 ring-emerald-500/20' : 'border-border bg-card text-muted-foreground hover:bg-muted/50'}`}>
                                            <HelpCircle className="size-5" />
                                            <span className="text-xs font-medium">Sınav</span>
                                        </button>
                                    </div>
                                </div>
                                
                                {form.lessonType === 'quiz' ? (
                                    <div className="space-y-4 border-t pt-4 max-h-[40vh] overflow-y-auto px-1">
                                        <div className="space-y-1.5">
                                            <Label className="text-xs font-medium">Geçme Notu (0-100)</Label>
                                            <Input type="number" min="0" max="100" value={form.passingScore} onChange={e => setForm(f => ({ ...f, passingScore: e.target.value }))} className="h-9" />
                                        </div>
                                        
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between">
                                                <Label className="text-xs font-medium">Sorular ({form.questions.length})</Label>
                                                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => {
                                                    setForm(f => ({
                                                        ...f, 
                                                        questions: [...f.questions, { 
                                                            id: Math.random().toString(36).substr(2, 9), 
                                                            questionText: '', 
                                                            options: [{ id: 'A', text: '' }, { id: 'B', text: '' }, { id: 'C', text: '' }, { id: 'D', text: '' }],
                                                            correctOptionId: 'A'
                                                        }]
                                                    }))
                                                }}>
                                                    <Plus className="size-3 mr-1" /> Soru Ekle
                                                </Button>
                                            </div>
                                            
                                            {form.questions.map((q, qIndex) => (
                                                <div key={q.id} className="rounded-lg border p-3 bg-muted/20 relative space-y-3">
                                                    <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 size-6 text-muted-foreground hover:text-destructive" onClick={() => {
                                                        const newQ = [...form.questions]; newQ.splice(qIndex, 1);
                                                        setForm(f => ({ ...f, questions: newQ }));
                                                    }}>
                                                        <Trash2 className="size-3.5" />
                                                    </Button>
                                                    <div className="space-y-1.5 pr-8">
                                                        <Label className="text-xs font-medium">{qIndex + 1}. Soru Metni</Label>
                                                        <Textarea value={q.questionText} onChange={e => {
                                                            const newQ = [...form.questions]; newQ[qIndex].questionText = e.target.value;
                                                            setForm(f => ({ ...f, questions: newQ }));
                                                        }} rows={2} className="resize-none text-sm p-2" placeholder="Sorunuzu yazın..." />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label className="text-xs font-medium">Şıklar (Doğru cevabı seçin)</Label>
                                                        {q.options.map((opt, oIndex) => (
                                                            <div key={opt.id} className="flex items-center gap-2">
                                                                <input type="radio" name={`correct_${q.id}`} checked={q.correctOptionId === opt.id} onChange={() => {
                                                                    const newQ = [...form.questions]; newQ[qIndex].correctOptionId = opt.id;
                                                                    setForm(f => ({ ...f, questions: newQ }));
                                                                }} className="cursor-pointer" />
                                                                <span className="text-xs font-bold w-4 text-center">{opt.id})</span>
                                                                <Input value={opt.text} onChange={e => {
                                                                    const newQ = [...form.questions]; newQ[qIndex].options[oIndex].text = e.target.value;
                                                                    setForm(f => ({ ...f, questions: newQ }));
                                                                }} className="h-8 text-xs flex-1" placeholder="Şık metni..." />
                                                            </div>
                                                        ))}
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
                                ) : form.lessonType === 'video' ? (
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-medium">YouTube Video URL veya ID</Label>
                                        <Input
                                            value={uploadedFileUrl}
                                            onChange={e => setUploadedFileUrl(e.target.value)}
                                            placeholder="Örn: https://youtube.com/watch?v=... veya dQw4w9WgXcQ"
                                            className="h-9"
                                        />
                                        <p className="text-[10px] text-muted-foreground">YouTube video linki, video ID veya playlist linki yapıştırın.</p>
                                    </div>
                                ) : (
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-medium">PDF Dosyası</Label>
                                        {uploadedFileUrl ? (
                                            <div className="flex items-center gap-3 rounded-lg border bg-emerald-50/50 p-3">
                                                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-amber-100 text-amber-600">
                                                    <FileText className="size-4" />
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="text-xs font-medium text-foreground truncate">{uploadedFileName || 'Dosya başarıyla yüklendi'}</div>
                                                    <div className="text-[10px] text-emerald-600 font-medium">Yükleme Tamamlandı ✓</div>
                                                </div>
                                                <Button variant="outline" size="icon" className="size-7 bg-white shrink-0 hover:border-destructive hover:text-destructive" onClick={() => { setUploadedFileUrl(''); setUploadedFileName(''); }}><X className="size-3.5" /></Button>
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
                            </>
                        )}
                    </div>
                    <DialogFooter className="px-5 py-3 border-t bg-card/50 m-0">
                        <Button variant="outline" size="sm" onClick={() => setShowModal(false)}>İptal</Button>
                        <Button onClick={modalMode === 'course' ? saveCourse : saveLesson} size="sm" disabled={uploading || (modalMode === 'lesson' && form.lessonType === 'pdf' && !uploadedFileUrl) || (modalMode === 'lesson' && form.lessonType === 'video' && !uploadedFileUrl)}>{editingItem ? 'Değişiklikleri Kaydet' : (modalMode === 'course' ? 'Kursu Oluştur' : 'Dersi Ekle')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
