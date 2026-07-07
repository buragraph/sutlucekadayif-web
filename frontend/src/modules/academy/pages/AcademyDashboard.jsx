import { useState, useEffect } from 'react';
import { GraduationCap, Settings, BookOpen, ChevronRight, Check } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../../../services/api';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';

export default function AcademyDashboard() {
    const { role } = useAuth();
    const navigate = useNavigate();
    const [courses, setCourses] = useState([]);
    const [loading, setLoading] = useState(true);
    const [progressSummary, setProgressSummary] = useState({});

    useEffect(() => { fetchData(); }, []);

    const fetchData = async () => {
        try {
            const [coursesRes, progressRes] = await Promise.all([
                api.get('/academy/courses'),
                api.get('/academy/progress/all/summary'),
            ]);
            const filtered = role === 'admin' ? coursesRes.data.courses : coursesRes.data.courses.filter(c => c.isPublished);
            setCourses(filtered);
            setProgressSummary(progressRes.data.byCourse || {});
        } catch (err) {
            console.error('Veri yüklenemedi:', err);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-1 flex-col gap-4 w-full h-full min-h-0">
            {/* Page Header */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
                <div>
                    <h1 className="text-3xl leading-none tracking-tight text-foreground">Akademi</h1>
                    <p className="text-xs text-muted-foreground mt-0.5">Eğitim içeriklerine göz atın ve kendinizi geliştirin.</p>
                </div>
                {role === 'admin' && (
                    <Button size="sm" className="h-8 text-xs" variant="outline" onClick={() => navigate('/admin/akademi/yonetim')}>
                        <Settings className="size-3.5 mr-1.5" />
                        Akademi Yönetimi
                    </Button>
                )}
            </div>

            {loading ? (
                <div className="flex flex-col items-center justify-center gap-3 py-16">
                    <Spinner className="size-8" />
                    <p className="text-sm text-muted-foreground">Yükleniyor...</p>
                </div>
            ) : courses.length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 py-20 text-muted-foreground border border-dashed rounded-lg bg-card">
                    <GraduationCap className="size-10 text-muted-foreground/40" />
                    <div className="text-center">
                        <p className="text-sm font-medium text-foreground">Henüz kurs yok</p>
                        <p className="text-xs text-muted-foreground mt-1">Eğitim içerikleri eklendiğinde burada görünecek.</p>
                    </div>
                </div>
            ) : (
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 overflow-y-auto pb-4">
                    {courses.map(course => {
                        const completedCount = progressSummary[course.id] || 0;
                        const totalCount = course.lessonCount || 0;
                        const progressPct = totalCount > 0 ? Math.min(100, Math.round((completedCount / totalCount) * 100)) : 0;

                        return (
                            <div
                                key={course.id}
                                className="group cursor-pointer flex flex-col overflow-hidden rounded-xl bg-card ring-1 ring-inset ring-foreground/20 transition-colors hover:ring-foreground/35"
                                onClick={() => navigate(`/admin/akademi/kurs/${course.id}`)}
                            >
                                <div className="relative aspect-[16/9] bg-muted/50 border-b shrink-0">
                                    {course.thumbnailUrl ? (
                                        <img src={course.thumbnailUrl} alt={course.title} className="size-full object-cover" />
                                    ) : (
                                        <div className="flex size-full items-center justify-center text-muted-foreground/30">
                                            <BookOpen className="size-8" />
                                        </div>
                                    )}
                                    {!course.isPublished && role === 'admin' && (
                                        <Badge variant="secondary" className="absolute right-2 top-2 text-[10px] font-medium bg-background/80 backdrop-blur-sm">
                                            Taslak
                                        </Badge>
                                    )}
                                </div>
                                <div className="flex flex-col flex-1 p-4">
                                    <h3 className="text-sm font-semibold leading-snug mb-1 text-foreground line-clamp-2">{course.title}</h3>
                                    {course.description && (
                                        <p className="line-clamp-2 text-xs text-muted-foreground mb-3 flex-1">{course.description}</p>
                                    )}
                                    <div className="mt-auto">
                                        <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                                            <span className="font-medium">{totalCount} ders</span>
                                            {progressPct === 100 ? (
                                                <span className="font-semibold text-emerald-600 flex items-center gap-1"><Check className="size-3" /> Tamamlandı</span>
                                            ) : (
                                                <span className="font-medium text-foreground">{progressPct}%</span>
                                            )}
                                        </div>
                                        {totalCount > 0 && (
                                            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                                                <div className="h-full rounded-full bg-primary transition-all duration-500 ease-out" style={{ width: `${progressPct}%` }} />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
