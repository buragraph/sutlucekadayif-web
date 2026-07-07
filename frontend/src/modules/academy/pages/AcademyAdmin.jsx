import { useState, useEffect, useRef, Fragment } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Pencil, Trash2, ChevronDown, ChevronRight, Video, FileText, Users, BarChart3, Search, Check, HelpCircle, RefreshCw, Download, UserX, BookOpen, GripVertical, MoreHorizontal } from 'lucide-react';
import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy, useSortable, arrayMove } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import api from '../../../services/api';
import { useToast, useConfirm } from '../../../shared/components/Toast';
import LessonEditorSheet from '../components/LessonEditorSheet';
import { parseYouTubeInput } from '../utils/youtube';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Card, CardAction, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Spinner } from '@/components/ui/spinner';

const ROL_ADLARI = { admin: 'Admin', sube_sahibi: 'Şube Sahibi', calisan: 'Çalışan' };

// Yumuşak (soft) rozet stilleri — tasarım referansındaki badge dili
// Kart kenar çizgisi: ortak Card'ın ring-foreground/10'u bu ekranda fazla silik
// kaldığından bir ton koyusu kullanılıyor
const KART = 'ring-foreground/20';

const ROZET = {
    yesil: 'rounded-md border-green-600/50 bg-green-50 px-2 py-0.5 font-medium text-[10px] text-green-600 dark:border-green-800/50 dark:bg-green-500/10 dark:text-green-400',
    mavi: 'rounded-md border-blue-600/50 bg-blue-50 px-2 py-0.5 font-medium text-[10px] text-blue-600 dark:border-blue-800/50 dark:bg-blue-500/10 dark:text-blue-400',
    kirmizi: 'rounded-md border-destructive/50 bg-destructive/10 px-2 py-0.5 font-medium text-[10px] text-destructive',
};

// Ders tipi göstergesi: sol renk çubuğu + ikon + etiket
const DERS_TIPI = {
    video: { bar: 'bg-blue-500', Icon: Video, etiket: 'Video' },
    pdf: { bar: 'bg-amber-500', Icon: FileText, etiket: 'PDF' },
    quiz: { bar: 'bg-emerald-500', Icon: HelpCircle, etiket: 'Sınav' },
};

const bosKursForm = { title: '', description: '', hedefSahip: true, hedefCalisan: true, tumSubeler: true, seciliSubeler: [] };

// Video dersin YouTube küçük resmi (satırda önizleme) — geçersiz/boş linkte null
function videoThumb(lesson) {
    if (lesson.lessonType !== 'video' || !lesson.videoUrl) return null;
    const p = parseYouTubeInput(lesson.videoUrl);
    return p.type === 'video' && /^[a-zA-Z0-9_-]{11}$/.test(p.id || '')
        ? `https://img.youtube.com/vi/${p.id}/default.jpg`
        : null;
}

// dnd-kit sıralanabilir öğe sarmalayıcısı (render-prop): ref/style/grip verir
function Sortable({ id, children }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
    return children({
        ref: setNodeRef,
        style: { transform: CSS.Transform.toString(transform), transition },
        isDragging,
        grip: { ...attributes, ...listeners },
    });
}

export default function AcademyAdmin() {
    const navigate = useNavigate();
    const toast = useToast();
    const confirm = useConfirm();
    const [activeTab, setActiveTab] = useState('courses');
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedCourse, setExpandedCourse] = useState(null);
    const [courseLessons, setCourseLessons] = useState({});

    // Kurs modalı
    const [showCourseModal, setShowCourseModal] = useState(false);
    const [editingCourse, setEditingCourse] = useState(null);
    const [courseForm, setCourseForm] = useState(bosKursForm);
    const courseInitialRef = useRef('');
    const [branchOptions, setBranchOptions] = useState(null); // [{slug, ad}]

    // Ders paneli
    const [lessonSheet, setLessonSheet] = useState({ open: false, courseId: null, lesson: null });

    // İstatistikler
    const [stats, setStats] = useState([]);
    const [subeAdlari, setSubeAdlari] = useState({});
    const [statsLoading, setStatsLoading] = useState(false);
    const [statsFetched, setStatsFetched] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedBranch, setSelectedBranch] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;
    const [expandedUser, setExpandedUser] = useState(null);
    const [userDetails, setUserDetails] = useState({});
    const [detailLoading, setDetailLoading] = useState(null);

    // İstatistikler kurs kartlarındaki tamamlanma özeti için sayfa açılışında da çekilir
    useEffect(() => { fetchCourses(); fetchStats(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { if (activeTab === 'stats') fetchStats(); }, [activeTab]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { setCurrentPage(1); }, [searchQuery, selectedBranch, statusFilter]);

    // Sürükle-bırak: 6px eşiği — normal tıklamalar sürükleme sayılmasın
    const dndSensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

    const fetchCourses = async () => {
        try { const { data } = await api.get('/academy/courses'); setCourses(data.courses); }
        catch { toast.error('Kurslar yüklenemedi'); }
        finally { setLoading(false); }
    };
    const fetchStats = async (force = false) => {
        if (statsFetched && !force) return;
        setStatsLoading(true);
        try {
            // force: backend'in 60 sn'lik istatistik cache'ini de atla (Yenile butonu)
            const { data } = await api.get('/academy/progress/admin/stats', { params: force ? { fresh: '1' } : {} });
            setStats(data.stats);
            setSubeAdlari(data.subeAdlari || {});
            setStatsFetched(true);
            if (force) { setUserDetails({}); setExpandedUser(null); } // detay cache'i de tazelensin
        } catch { toast.error('İstatistikler yüklenemedi'); }
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

    // ── Kurs modalı ──
    const openCourseModal = (course = null) => {
        setEditingCourse(course);
        const f = {
            title: course?.title || '',
            description: course?.description || '',
            // targetRoles/targetSubeler boş = herkes/tüm şubeler
            hedefSahip: !course?.targetRoles?.length || course.targetRoles.includes('sube_sahibi'),
            hedefCalisan: !course?.targetRoles?.length || course.targetRoles.includes('calisan'),
            tumSubeler: !course?.targetSubeler?.length,
            seciliSubeler: course?.targetSubeler || [],
        };
        setCourseForm(f);
        courseInitialRef.current = JSON.stringify(f);
        setShowCourseModal(true);
        if (!branchOptions) {
            api.get('/branches/konumlar')
                .then(({ data }) => setBranchOptions(data.konumlar || []))
                .catch(() => setBranchOptions([]));
        }
    };
    const requestCloseCourseModal = async () => {
        if (JSON.stringify(courseForm) !== courseInitialRef.current) {
            const yes = await confirm('Kaydedilmemiş değişiklikler var. Kapatırsanız kaybolacak. Yine de kapatılsın mı?');
            if (!yes) return;
        }
        setShowCourseModal(false);
    };
    const saveCourse = async () => {
        if (!courseForm.title.trim()) return toast.error('Kurs başlığı gerekli');
        if (!courseForm.hedefSahip && !courseForm.hedefCalisan) return toast.error('En az bir hedef rol seçin');
        if (!courseForm.tumSubeler && courseForm.seciliSubeler.length === 0) return toast.error('En az bir şube seçin veya "Tüm şubeler"i işaretleyin');

        const payload = {
            title: courseForm.title,
            description: courseForm.description,
            targetRoles: courseForm.hedefSahip && courseForm.hedefCalisan ? [] : [courseForm.hedefSahip ? 'sube_sahibi' : 'calisan'],
            targetSubeler: courseForm.tumSubeler ? [] : courseForm.seciliSubeler,
        };
        try {
            if (editingCourse) { await api.put(`/academy/courses/${editingCourse.id}`, payload); toast.success('Kurs güncellendi'); }
            else { await api.post('/academy/courses', payload); toast.success('Kurs oluşturuldu'); }
            setShowCourseModal(false); fetchCourses();
        } catch { toast.error('İşlem başarısız'); }
    };
    const deleteCourse = async (course) => {
        const yes = await confirm(`"${course.title}" kursu, içindeki ${course.lessonCount || 0} ders ve kullanıcıların bu kurstaki ilerleme/sınav kayıtlarıyla birlikte silinecek. Bu işlem geri alınamaz.`);
        if (!yes) return;
        try { await api.delete(`/academy/courses/${course.id}`); toast.success('Kurs silindi'); if (expandedCourse === course.id) setExpandedCourse(null); fetchCourses(); }
        catch { toast.error('Kurs silinemedi'); }
    };
    const togglePublish = async (course) => {
        try { await api.put(`/academy/courses/${course.id}`, { isPublished: !course.isPublished }); setCourses(prev => prev.map(c => c.id === course.id ? { ...c, isPublished: !c.isPublished } : c)); toast.success(course.isPublished ? 'Kurs yayından kaldırıldı' : 'Kurs yayınlandı'); }
        catch { toast.error('İşlem başarısız'); }
    };
    const onCourseDragEnd = ({ active, over }) => {
        if (!over || active.id === over.id) return;
        const oldIndex = courses.findIndex(c => c.id === active.id);
        const newIndex = courses.findIndex(c => c.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        const yeni = arrayMove(courses, oldIndex, newIndex);
        setCourses(yeni);
        api.put('/academy/courses/reorder', { order: yeni.map((c, i) => ({ id: c.id, orderIndex: i })) })
            .catch(() => { toast.error('Sıralama güncellenemedi'); fetchCourses(); });
    };

    // ── Dersler ──
    const deleteLesson = async (courseId, lesson) => {
        const yes = await confirm(`"${lesson.title}" dersi ve kullanıcıların bu dersteki tamamlama kayıtları silinecek.`);
        if (!yes) return;
        try { await api.delete(`/academy/lessons/${courseId}/${lesson.id}`); toast.success('Ders silindi'); fetchLessons(courseId); fetchCourses(); }
        catch { toast.error('Ders silinemedi'); }
    };
    const onLessonDragEnd = (courseId, { active, over }) => {
        if (!over || active.id === over.id) return;
        const lessons = courseLessons[courseId] || [];
        const oldIndex = lessons.findIndex(l => l.id === active.id);
        const newIndex = lessons.findIndex(l => l.id === over.id);
        if (oldIndex < 0 || newIndex < 0) return;
        const yeni = arrayMove(lessons, oldIndex, newIndex);
        setCourseLessons(prev => ({ ...prev, [courseId]: yeni }));
        api.put(`/academy/lessons/${courseId}/reorder`, { order: yeni.map((l, idx) => ({ id: l.id, orderIndex: idx })) })
            .catch(() => { toast.error('Sıralama güncellenemedi'); fetchLessons(courseId); });
    };

    // ── İstatistik detayı ──
    const toggleUserDetail = async (userId) => {
        if (expandedUser === userId) { setExpandedUser(null); return; }
        setExpandedUser(userId);
        if (!userDetails[userId]) {
            setDetailLoading(userId);
            try {
                const { data } = await api.get(`/academy/progress/admin/stats/${userId}/detail`);
                setUserDetails(prev => ({ ...prev, [userId]: data.detay }));
            } catch { toast.error('Kullanıcı detayı yüklenemedi'); }
            finally { setDetailLoading(null); }
        }
    };

    const formatDate = (dateStr) => { if (!dateStr) return '—'; return new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }); };
    const subeAdi = (slug) => (slug ? (subeAdlari[slug] || slug) : null);

    // Kursun bu kullanıcıya görünüp görünmediği (backend courseVisibleToUser + yayın kuralının aynası).
    // İlerleme paydası buna göre hesaplanır — taslak/hedef-dışı kurslar yüzdeyi şişirmesin.
    const kursGorunur = (c, user) => {
        if (!c.isPublished) return false;
        if (user.role === 'admin') return true;
        if (Array.isArray(c.targetRoles) && c.targetRoles.length > 0 && !c.targetRoles.includes(user.role)) return false;
        if (Array.isArray(c.targetSubeler) && c.targetSubeler.length > 0 && !c.targetSubeler.includes(user.subeSlug)) return false;
        return true;
    };

    // Kurs kartındaki tamamlanma özeti: hedef kitledeki kaç kullanıcı kursu bitirdi
    const kursOzet = (c) => {
        if (!statsFetched || !c.isPublished || !(c.lessonCount > 0)) return null;
        const hedef = stats.filter(u => u && u.role !== 'admin' && kursGorunur(c, u));
        if (hedef.length === 0) return null;
        const tamamlayan = hedef.filter(u => (u.byCourse?.[c.id]?.count || 0) >= c.lessonCount).length;
        return `${tamamlayan}/${hedef.length} kullanıcı tamamladı`;
    };

    const exportCsv = (rows) => {
        const sep = ';';
        const hucre = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
        const headers = ['Ad', 'E-posta', 'Şube', 'Rol', 'Tamamlanan Ders', 'Son Aktivite', ...courses.map(c => c.title)];
        const lines = rows.map(u => {
            const kursYuzdeleri = courses.map(c => {
                const count = u.byCourse?.[c.id]?.count || 0;
                const total = c.lessonCount || 0;
                return total > 0 ? `%${Math.min(100, Math.round((count / total) * 100))}` : '-';
            });
            return [
                u.displayName || '', u.email || '', subeAdi(u.subeSlug) || '', ROL_ADLARI[u.role] || u.role || '',
                u.totalCompleted || 0, u.lastActivity ? formatDate(u.lastActivity) : 'Başlamadı',
                ...kursYuzdeleri,
            ].map(hucre).join(sep);
        });
        const csv = '﻿' + headers.map(hucre).join(sep) + '\n' + lines.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `akademi-istatistik-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
    };

    if (loading) return <div className="flex flex-col items-center justify-center gap-3 py-16"><Spinner className="size-8" /><p className="text-sm text-muted-foreground">Yükleniyor...</p></div>;

    return (
        <div className="flex flex-col gap-4 w-full h-full min-h-0">
            {/* Sayfa başlığı */}
            <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between shrink-0">
                <div className="flex items-center gap-3">
                    <Button variant="outline" size="icon" className="size-8 shrink-0" onClick={() => navigate('/admin/akademi')}>
                        <ArrowLeft />
                    </Button>
                    <div className="space-y-1">
                        <h1 className="text-3xl leading-none tracking-tight text-foreground">Akademi Yönetimi</h1>
                        <p className="text-sm text-muted-foreground">Eğitim içeriklerini ve kullanıcı istatistiklerini yönetin.</p>
                    </div>
                </div>
                {activeTab === 'courses' && (
                    <Button size="sm" onClick={() => openCourseModal()}>
                        <Plus data-icon="inline-start" /> Yeni Kurs
                    </Button>
                )}
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 min-h-0 flex flex-col gap-4">
                <div className="border-b border-border shrink-0">
                    <TabsList variant="line">
                        <TabsTrigger value="courses"><BookOpen data-icon="inline-start" /> Kurslar</TabsTrigger>
                        <TabsTrigger value="stats"><BarChart3 data-icon="inline-start" /> Kullanıcı İstatistikleri</TabsTrigger>
                    </TabsList>
                </div>

                {/* ── Kurslar ── */}
                <TabsContent value="courses" className="flex-1 min-h-0 overflow-y-auto pb-4">
                    {courses.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground border border-dashed border-foreground/20 rounded-xl">
                            <BookOpen className="size-10 text-muted-foreground/40" />
                            <div className="text-center">
                                <p className="text-sm font-medium text-foreground">Henüz kurs eklenmemiş</p>
                                <p className="text-xs text-muted-foreground mt-1">İlk kursunuzu oluşturarak eğitime başlayın.</p>
                            </div>
                            <Button size="sm" variant="outline" onClick={() => openCourseModal()}>
                                <Plus data-icon="inline-start" /> Yeni Kurs
                            </Button>
                        </div>
                    ) : (
                        <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={onCourseDragEnd}>
                            <SortableContext items={courses.map(c => c.id)} strategy={verticalListSortingStrategy}>
                                <div className="flex flex-col gap-3">
                                    {courses.map((course) => (
                                        <Sortable id={course.id} key={course.id}>
                                            {({ ref, style, grip, isDragging }) => (
                                                <Card ref={ref} style={style} className={cn('py-0 gap-0', KART, isDragging && 'relative z-10 opacity-80')}>
                                                    <div className="flex cursor-pointer items-center gap-2 px-3 py-3.5 transition-colors hover:bg-muted/30" onClick={() => toggleCourse(course.id)}>
                                                        <button
                                                            {...grip}
                                                            onClick={e => e.stopPropagation()}
                                                            className="cursor-grab active:cursor-grabbing touch-none p-1 text-muted-foreground/50 hover:text-foreground shrink-0"
                                                            title="Sürükleyerek sırala"
                                                        >
                                                            <GripVertical className="size-4" />
                                                        </button>
                                                        {expandedCourse === course.id
                                                            ? <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
                                                            : <ChevronRight className="size-4 shrink-0 text-muted-foreground" />}
                                                        <div className="min-w-0 flex-1 pl-1">
                                                            <div className="flex flex-wrap items-center gap-2">
                                                                <span className="text-sm font-medium text-foreground">{course.title}</span>
                                                                {Array.isArray(course.targetRoles) && course.targetRoles.length === 1 && (
                                                                    <Badge variant="secondary" className={ROZET.mavi}>
                                                                        {course.targetRoles[0] === 'calisan' ? 'Sadece çalışanlar' : 'Sadece şube sahipleri'}
                                                                    </Badge>
                                                                )}
                                                                {Array.isArray(course.targetSubeler) && course.targetSubeler.length > 0 && (
                                                                    <Badge variant="secondary" className={ROZET.mavi}>{course.targetSubeler.length} şube</Badge>
                                                                )}
                                                            </div>
                                                            {course.description && <p className="text-xs text-muted-foreground truncate mt-0.5">{course.description}</p>}
                                                        </div>
                                                        <div className="flex items-center gap-4 shrink-0">
                                                            <span className="text-xs text-muted-foreground hidden md:inline whitespace-nowrap">
                                                                {course.lessonCount || 0} ders{kursOzet(course) ? ` · ${kursOzet(course)}` : ''}
                                                            </span>
                                                            <label className="flex items-center gap-1.5 cursor-pointer" onClick={e => e.stopPropagation()} title={course.isPublished ? 'Yayından kaldır' : 'Yayınla'}>
                                                                <Switch size="sm" checked={!!course.isPublished} onCheckedChange={() => togglePublish(course)} />
                                                                <span className={cn('text-xs whitespace-nowrap', course.isPublished ? 'font-medium text-green-600 dark:text-green-400' : 'text-muted-foreground')}>
                                                                    {course.isPublished ? 'Yayında' : 'Taslak'}
                                                                </span>
                                                            </label>
                                                            <div onClick={e => e.stopPropagation()}>
                                                                <DropdownMenu>
                                                                    <DropdownMenuTrigger asChild>
                                                                        <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" title="Diğer işlemler">
                                                                            <MoreHorizontal className="size-4" />
                                                                        </Button>
                                                                    </DropdownMenuTrigger>
                                                                    <DropdownMenuContent align="end">
                                                                        <DropdownMenuGroup>
                                                                            <DropdownMenuItem onClick={() => openCourseModal(course)}>
                                                                                <Pencil /> Kursu Düzenle
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem onClick={() => setLessonSheet({ open: true, courseId: course.id, lesson: null })}>
                                                                                <Plus /> Ders Ekle
                                                                            </DropdownMenuItem>
                                                                            <DropdownMenuItem variant="destructive" onClick={() => deleteCourse(course)}>
                                                                                <Trash2 /> Kursu Sil
                                                                            </DropdownMenuItem>
                                                                        </DropdownMenuGroup>
                                                                    </DropdownMenuContent>
                                                                </DropdownMenu>
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Dersler */}
                                                    {expandedCourse === course.id && (
                                                        <div className="border-t">
                                                            <div className="flex items-center justify-between bg-muted/30 px-4 py-2">
                                                                <span className="text-xs font-medium text-muted-foreground">Ders İçerikleri — düzenlemek için derse tıklayın</span>
                                                                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => setLessonSheet({ open: true, courseId: course.id, lesson: null })}>
                                                                    <Plus data-icon="inline-start" /> Ders Ekle
                                                                </Button>
                                                            </div>
                                                            {!courseLessons[course.id] ? (
                                                                <div className="py-6 flex justify-center"><Spinner className="size-5 text-muted-foreground" /></div>
                                                            ) : courseLessons[course.id].length === 0 ? (
                                                                <p className="py-8 text-center text-xs text-muted-foreground">Bu kursta henüz ders yok</p>
                                                            ) : (
                                                                <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={(e) => onLessonDragEnd(course.id, e)}>
                                                                    <SortableContext items={courseLessons[course.id].map(l => l.id)} strategy={verticalListSortingStrategy}>
                                                                        <div className="flex flex-col divide-y divide-border">
                                                                            {courseLessons[course.id].map((lesson, i) => {
                                                                                const tip = DERS_TIPI[lesson.lessonType] || DERS_TIPI.video;
                                                                                const thumb = videoThumb(lesson);
                                                                                return (
                                                                                    <Sortable id={lesson.id} key={lesson.id}>
                                                                                        {({ ref: lref, style: lstyle, grip: lgrip, isDragging: lDragging }) => (
                                                                                            <div
                                                                                                ref={lref}
                                                                                                style={lstyle}
                                                                                                className={cn('group flex items-center gap-3 bg-card px-3 py-2.5 transition-colors hover:bg-muted/30 cursor-pointer', lDragging && 'relative z-10 opacity-80')}
                                                                                                onClick={() => setLessonSheet({ open: true, courseId: course.id, lesson })}
                                                                                            >
                                                                                                <button
                                                                                                    {...lgrip}
                                                                                                    onClick={e => e.stopPropagation()}
                                                                                                    className="cursor-grab active:cursor-grabbing touch-none p-1 text-muted-foreground/50 hover:text-foreground shrink-0"
                                                                                                    title="Sürükleyerek sırala"
                                                                                                >
                                                                                                    <GripVertical className="size-4" />
                                                                                                </button>
                                                                                                <div className={`w-1 self-stretch shrink-0 rounded-md ${tip.bar}`} />
                                                                                                <span className="w-5 text-center text-xs text-muted-foreground shrink-0">{i + 1}</span>
                                                                                                {thumb ? (
                                                                                                    <img src={thumb} alt="" className="h-9 w-14 rounded-md object-cover shrink-0" loading="lazy" />
                                                                                                ) : (
                                                                                                    <tip.Icon className="size-4 shrink-0 text-muted-foreground" />
                                                                                                )}
                                                                                                <div className="min-w-0 flex-1">
                                                                                                    <div className="text-sm font-medium text-foreground leading-none truncate">{lesson.title}</div>
                                                                                                    <div className="text-xs text-muted-foreground leading-none mt-1">{tip.etiket}</div>
                                                                                                </div>
                                                                                                <div onClick={e => e.stopPropagation()}>
                                                                                                    <DropdownMenu>
                                                                                                        <DropdownMenuTrigger asChild>
                                                                                                            <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-foreground" title="Diğer işlemler">
                                                                                                                <MoreHorizontal className="size-4" />
                                                                                                            </Button>
                                                                                                        </DropdownMenuTrigger>
                                                                                                        <DropdownMenuContent align="end">
                                                                                                            <DropdownMenuGroup>
                                                                                                                <DropdownMenuItem onClick={() => setLessonSheet({ open: true, courseId: course.id, lesson })}>
                                                                                                                    <Pencil /> Düzenle
                                                                                                                </DropdownMenuItem>
                                                                                                                <DropdownMenuItem variant="destructive" onClick={() => deleteLesson(course.id, lesson)}>
                                                                                                                    <Trash2 /> Sil
                                                                                                                </DropdownMenuItem>
                                                                                                            </DropdownMenuGroup>
                                                                                                        </DropdownMenuContent>
                                                                                                    </DropdownMenu>
                                                                                                </div>
                                                                                            </div>
                                                                                        )}
                                                                                    </Sortable>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </SortableContext>
                                                                </DndContext>
                                                            )}
                                                        </div>
                                                    )}
                                                </Card>
                                            )}
                                        </Sortable>
                                    ))}
                                </div>
                            </SortableContext>
                        </DndContext>
                    )}
                </TabsContent>

                {/* ── İstatistikler ── */}
                <TabsContent value="stats" className="flex-1 min-h-0 overflow-y-auto pb-4">
                    {statsLoading ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-16"><Spinner className="size-8" /><p className="text-sm text-muted-foreground">İstatistikler yükleniyor...</p></div>
                    ) : !stats || stats.length === 0 ? (
                        <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground border border-dashed border-foreground/20 rounded-xl">
                            <BarChart3 className="size-10 text-muted-foreground/40" />
                            <div className="text-center">
                                <p className="text-sm font-medium text-foreground">Kullanıcı istatistiği yok</p>
                                <p className="text-xs text-muted-foreground mt-1">Sistemde henüz kayıtlı kullanıcı bulunmuyor.</p>
                            </div>
                        </div>
                    ) : (() => {
                        const validStats = Array.isArray(stats) ? stats.filter(Boolean) : [];
                        const branches = [...new Set(validStats.map(s => s.subeSlug).filter(Boolean))]
                            .sort((a, b) => (subeAdi(a) || '').localeCompare(subeAdi(b) || '', 'tr'));
                        const baslamayanSayisi = validStats.filter(u => (u.totalCompleted || 0) === 0).length;
                        const toplamTamamlanan = validStats.reduce((s, u) => s + (u.totalCompleted || 0), 0);
                        const toplamDersSayisi = courses.reduce((s, c) => s + (c.lessonCount || 0), 0);
                        const filteredStats = validStats.filter(user => {
                            if (searchQuery) {
                                const q = searchQuery.toLowerCase();
                                if (!(user.displayName || '').toLowerCase().includes(q) && !(user.email || '').toLowerCase().includes(q)) return false;
                            }
                            if (selectedBranch && user.subeSlug !== selectedBranch) return false;
                            if (statusFilter === 'notstarted' && (user.totalCompleted || 0) > 0) return false;
                            if (statusFilter === 'started' && (user.totalCompleted || 0) === 0) return false;
                            return true;
                        });
                        const totalPages = Math.ceil(filteredStats.length / itemsPerPage) || 1;
                        const currentStats = filteredStats.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

                        const kpiKartlari = [
                            { label: 'Kayıtlı Kullanıcı', val: validStats.length, aciklama: 'eğitim hedef kitlesi', Icon: Users },
                            { label: 'Hiç Başlamayan', val: baslamayanSayisi, aciklama: 'hiç ders tamamlamadı', Icon: UserX },
                            { label: 'Tamamlanan Ders', val: toplamTamamlanan, aciklama: 'tüm kullanıcıların toplamı', Icon: Check },
                            { label: 'Toplam Kurs', val: courses.length, aciklama: `${toplamDersSayisi} ders içerik`, Icon: BookOpen },
                        ];

                        return (
                            <div className="flex flex-col gap-4">
                                {/* KPI kartları */}
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                                    {kpiKartlari.map(k => (
                                        <Card key={k.label} size="sm" className={KART}>
                                            <CardHeader>
                                                <CardTitle className="text-sm">{k.label}</CardTitle>
                                                <CardAction><k.Icon className="size-4 text-muted-foreground" /></CardAction>
                                            </CardHeader>
                                            <CardContent className="flex flex-col gap-1">
                                                <span className="text-3xl text-foreground leading-none tracking-tight">{k.val}</span>
                                                <span className="text-xs text-muted-foreground">{k.aciklama}</span>
                                            </CardContent>
                                        </Card>
                                    ))}
                                </div>

                                {/* Filtre çubuğu */}
                                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                    <div className="relative flex-1">
                                        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                                        <Input placeholder="İsim veya e-posta ile ara..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="pl-9 h-8" />
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <select className="h-8 rounded-md border border-input bg-background px-3 text-sm min-w-[140px]" value={selectedBranch} onChange={e => setSelectedBranch(e.target.value)}>
                                            <option value="">Tüm Şubeler</option>
                                            {branches.map(b => <option key={b} value={b}>{subeAdi(b)}</option>)}
                                        </select>
                                        <select className="h-8 rounded-md border border-input bg-background px-3 text-sm min-w-[130px]" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                                            <option value="">Tüm Durumlar</option>
                                            <option value="notstarted">Hiç Başlamayanlar</option>
                                            <option value="started">Başlayanlar</option>
                                        </select>
                                        {(searchQuery || selectedBranch || statusFilter) && <Badge variant="secondary" className="h-6">Sonuç: {filteredStats.length}</Badge>}
                                        <Button variant="outline" size="sm" className="h-8" onClick={() => fetchStats(true)} title="İstatistikleri yenile">
                                            <RefreshCw data-icon="inline-start" /> Yenile
                                        </Button>
                                        <Button variant="outline" size="sm" className="h-8" onClick={() => exportCsv(filteredStats)} disabled={filteredStats.length === 0} title="Filtrelenmiş listeyi CSV olarak indir">
                                            <Download data-icon="inline-start" /> CSV
                                        </Button>
                                    </div>
                                </div>

                                {/* Kullanıcı tablosu */}
                                <Card className={cn('py-0 gap-0', KART)}>
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow className="hover:bg-transparent">
                                                    <TableHead className="py-3 min-w-[220px] pl-4">Kullanıcı</TableHead>
                                                    <TableHead className="py-3 w-[140px]">Şube</TableHead>
                                                    <TableHead className="py-3 w-[110px]">Rol</TableHead>
                                                    <TableHead className="py-3 min-w-[180px]">İlerleme</TableHead>
                                                    <TableHead className="text-right py-3 w-[150px]">Son Aktivite</TableHead>
                                                    <TableHead className="w-[40px] pr-4" />
                                                </TableRow>
                                            </TableHeader>
                                            <TableBody>
                                                {currentStats.map(user => {
                                                    const displayChar = (user.displayName || user.email || '?')[0]?.toUpperCase() || '?';
                                                    const basladi = (user.totalCompleted || 0) > 0;
                                                    // Payda: yalnızca bu kullanıcıya görünen (yayında + hedefinde) kursların dersleri
                                                    const kisiToplamDers = courses.filter(c => kursGorunur(c, user)).reduce((s, c) => s + (c.lessonCount || 0), 0);
                                                    const genelPct = kisiToplamDers > 0 ? Math.min(100, Math.round(((user.totalCompleted || 0) / kisiToplamDers) * 100)) : 0;
                                                    const acik = expandedUser === user.userId;
                                                    const detay = userDetails[user.userId];
                                                    const sinavlar = (detay || []).filter(d => d.lessonType === 'quiz');
                                                    // Detayda kullanıcıya görünen kurslar + (artık görünmese de) ilerlemesi olanlar
                                                    const detayKurslari = courses.filter(c => kursGorunur(c, user) || (user.byCourse?.[c.id]?.count || 0) > 0);
                                                    return (
                                                        <Fragment key={user.userId}>
                                                            <TableRow className="cursor-pointer hover:bg-muted/30" onClick={() => toggleUserDetail(user.userId)}>
                                                                <TableCell className="py-2.5 pl-4">
                                                                    <div className="flex items-center gap-3">
                                                                        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">{displayChar}</div>
                                                                        <div className="min-w-0">
                                                                            <div className="text-sm font-medium text-foreground truncate">{user.displayName || 'İsimsiz Kullanıcı'}</div>
                                                                            <div className="text-xs text-muted-foreground truncate">{user.email || '—'}</div>
                                                                        </div>
                                                                    </div>
                                                                </TableCell>
                                                                <TableCell className="py-2.5 text-xs text-muted-foreground">{user.subeSlug ? subeAdi(user.subeSlug) : '—'}</TableCell>
                                                                <TableCell className="py-2.5 text-xs text-muted-foreground">{ROL_ADLARI[user.role] || user.role || '—'}</TableCell>
                                                                <TableCell className="py-2.5">
                                                                    {basladi ? (
                                                                        <div className="flex items-center gap-3">
                                                                            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted shrink-0">
                                                                                <div className="h-full rounded-full bg-primary" style={{ width: `${genelPct}%` }} />
                                                                            </div>
                                                                            <span className="text-xs text-foreground whitespace-nowrap">{user.totalCompleted} / {kisiToplamDers} ders</span>
                                                                        </div>
                                                                    ) : (
                                                                        <Badge variant="secondary" className={ROZET.kirmizi}>Başlamadı</Badge>
                                                                    )}
                                                                </TableCell>
                                                                <TableCell className="text-right text-xs text-muted-foreground py-2.5">{formatDate(user.lastActivity)}</TableCell>
                                                                <TableCell className="py-2.5 pr-4 text-muted-foreground">
                                                                    {acik ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                                                                </TableCell>
                                                            </TableRow>
                                                            {acik && (
                                                                <TableRow className="bg-muted/30 hover:bg-muted/30">
                                                                    <TableCell colSpan={6} className="py-4 px-6">
                                                                        {detailLoading === user.userId ? (
                                                                            <div className="flex justify-center py-4"><Spinner className="size-5 text-muted-foreground" /></div>
                                                                        ) : (
                                                                            <div className="grid gap-5 lg:grid-cols-2">
                                                                                <div>
                                                                                    <h5 className="text-xs font-medium text-muted-foreground mb-2.5">Kurs Bazlı İlerleme</h5>
                                                                                    <div className="flex flex-col gap-2">
                                                                                        {detayKurslari.map(c => {
                                                                                            const count = user.byCourse?.[c.id]?.count || 0;
                                                                                            const total = c.lessonCount || 0;
                                                                                            const pct = total > 0 ? Math.min(100, Math.round((count / total) * 100)) : 0;
                                                                                            return (
                                                                                                <div key={c.id} className="flex items-center gap-3">
                                                                                                    <span className="text-xs text-foreground w-44 truncate shrink-0" title={c.title}>{c.title}</span>
                                                                                                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                                                                                                        <div className={`h-full rounded-full ${pct === 100 ? 'bg-green-600 dark:bg-green-400' : 'bg-primary'}`} style={{ width: `${pct}%` }} />
                                                                                                    </div>
                                                                                                    <span className="text-xs text-muted-foreground w-16 text-right shrink-0">
                                                                                                        {count > 0 ? `${count}/${total} (%${pct})` : '—'}
                                                                                                    </span>
                                                                                                </div>
                                                                                            );
                                                                                        })}
                                                                                        {detayKurslari.length === 0 && <p className="text-xs text-muted-foreground">Bu kullanıcıya atanmış kurs yok.</p>}
                                                                                    </div>
                                                                                </div>
                                                                                <div>
                                                                                    <h5 className="text-xs font-medium text-muted-foreground mb-2.5">Sınav Sonuçları</h5>
                                                                                    {sinavlar.length === 0 ? (
                                                                                        <p className="text-xs text-muted-foreground">Tamamlanmış sınav yok.</p>
                                                                                    ) : (
                                                                                        <div className="flex flex-col gap-1.5">
                                                                                            {sinavlar.map(s => (
                                                                                                <div key={s.lessonId} className="flex items-center justify-between gap-3 rounded-md border bg-background px-3 py-2">
                                                                                                    <div className="min-w-0">
                                                                                                        <div className="text-xs font-medium text-foreground truncate">{s.lessonTitle}</div>
                                                                                                        <div className="text-[10px] text-muted-foreground truncate">{s.courseTitle} · {formatDate(s.completedAt)}</div>
                                                                                                    </div>
                                                                                                    <Badge variant="secondary" className={(s.score ?? 0) >= 85 ? ROZET.yesil : ROZET.mavi}>
                                                                                                        %{s.score ?? '—'}
                                                                                                    </Badge>
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        )}
                                                                    </TableCell>
                                                                </TableRow>
                                                            )}
                                                        </Fragment>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </div>
                                </Card>

                                {totalPages > 1 && (
                                    <div className="flex items-center justify-between">
                                        <p className="text-xs text-muted-foreground">
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
                </TabsContent>
            </Tabs>

            {/* Kurs Modalı */}
            <Dialog open={showCourseModal} onOpenChange={(open) => !open && requestCloseCourseModal()}>
                <DialogContent className="sm:max-w-lg p-0 gap-0 overflow-hidden">
                    <DialogHeader className="px-5 py-4 border-b">
                        <DialogTitle className="text-sm font-medium">{editingCourse ? 'Kurs Düzenle' : 'Yeni Kurs'}</DialogTitle>
                    </DialogHeader>
                    <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto max-h-[65vh]">
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs font-medium">Kurs Başlığı</Label>
                            <Input value={courseForm.title} onChange={e => setCourseForm(f => ({ ...f, title: e.target.value }))} placeholder="Örn: Kadayıf Ustalık Eğitimi" autoFocus className="h-9" />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs font-medium">Açıklama</Label>
                            <Textarea value={courseForm.description} onChange={e => setCourseForm(f => ({ ...f, description: e.target.value }))} placeholder="Kısa açıklama girin..." rows={3} className="resize-none" />
                        </div>

                        <div className="flex flex-col gap-2 border-t pt-4">
                            <Label className="text-xs font-medium">Hedef Kitle</Label>
                            <p className="text-[10px] text-muted-foreground -mt-1">Kurs yalnızca seçilen rollere ve şubelere görünür. Adminler her kursu görür.</p>
                            <div className="flex items-center gap-5 pt-1">
                                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                                    <Checkbox checked={courseForm.hedefSahip} onCheckedChange={(v) => setCourseForm(f => ({ ...f, hedefSahip: !!v }))} />
                                    Şube Sahipleri
                                </label>
                                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                                    <Checkbox checked={courseForm.hedefCalisan} onCheckedChange={(v) => setCourseForm(f => ({ ...f, hedefCalisan: !!v }))} />
                                    Çalışanlar
                                </label>
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                                <Checkbox checked={courseForm.tumSubeler} onCheckedChange={(v) => setCourseForm(f => ({ ...f, tumSubeler: !!v }))} />
                                Tüm şubeler
                            </label>
                            {!courseForm.tumSubeler && (
                                branchOptions === null ? (
                                    <div className="flex justify-center py-3"><Spinner className="size-4 text-muted-foreground" /></div>
                                ) : (
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-40 overflow-y-auto rounded-lg border bg-muted/20 p-3">
                                        {branchOptions.map(b => (
                                            <label key={b.slug} className="flex items-center gap-2 text-xs cursor-pointer py-0.5">
                                                <Checkbox
                                                    checked={courseForm.seciliSubeler.includes(b.slug)}
                                                    onCheckedChange={(v) => setCourseForm(f => ({
                                                        ...f,
                                                        seciliSubeler: v ? [...f.seciliSubeler, b.slug] : f.seciliSubeler.filter(s => s !== b.slug),
                                                    }))}
                                                />
                                                <span className="truncate">{b.ad}</span>
                                            </label>
                                        ))}
                                        {branchOptions.length === 0 && <p className="text-xs text-muted-foreground col-span-full">Şube listesi alınamadı.</p>}
                                    </div>
                                )
                            )}
                        </div>
                    </div>
                    <DialogFooter className="px-5 py-3 border-t m-0">
                        <Button variant="outline" size="sm" onClick={requestCloseCourseModal}>İptal</Button>
                        <Button onClick={saveCourse} size="sm">{editingCourse ? 'Değişiklikleri Kaydet' : 'Kursu Oluştur'}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Ders Paneli */}
            <LessonEditorSheet
                open={lessonSheet.open}
                courseId={lessonSheet.courseId}
                lesson={lessonSheet.lesson}
                onClose={() => setLessonSheet(s => ({ ...s, open: false }))}
                onSaved={(courseId) => { fetchLessons(courseId); fetchCourses(); }}
            />
        </div>
    );
}
