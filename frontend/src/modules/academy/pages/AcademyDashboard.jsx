import { useState, useEffect } from 'react';
import { GraduationCap, Settings, BookOpen, ChevronRight } from 'lucide-react';
import { useAuth } from '../../../context/AuthContext';
import { useNavigate } from 'react-router-dom';
import api from '../../../services/api';

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
        <div className="page-padding">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, color: '#111', margin: 0 }}>Akademi</h1>
                <div style={{ flex: 1 }} />
                {role === 'admin' && (
                    <button className="btn btn--primary" onClick={() => navigate('/admin/akademi/yonetim')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 14px', fontSize: 12 }}>
                        <Settings size={14} />
                        Akademi Dashboard
                    </button>
                )}
            </div>

            {loading ? (
                <div className="loading-container"><div className="spinner" /><p className="loading-text">Yükleniyor...</p></div>
            ) : courses.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 20px', color: 'var(--color-text-muted)' }}>
                    <GraduationCap size={48} strokeWidth={1.5} />
                    <h3 style={{ marginTop: 16, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Henüz kurs yok</h3>
                    <p style={{ marginTop: 4, fontSize: 14 }}>Kurslar eklendiğinde burada görünecek.</p>
                </div>
            ) : (
                <div className="academy-grid">
                    {courses.map(course => {
                        const completedCount = progressSummary[course.id] || 0;
                        const totalCount = course.lessonCount || 0;
                        const progressPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

                        return (
                            <div
                                key={course.id}
                                className="academy-card"
                                onClick={() => navigate(`/admin/akademi/kurs/${course.id}`)}
                            >
                                <div className="academy-card__thumbnail">
                                    {course.thumbnailUrl ? (
                                        <img src={course.thumbnailUrl} alt={course.title} />
                                    ) : (
                                        <div className="academy-card__thumbnail-placeholder">
                                            <BookOpen size={32} />
                                        </div>
                                    )}
                                    {!course.isPublished && role === 'admin' && (
                                        <span className="academy-card__draft-badge">Taslak</span>
                                    )}
                                </div>
                                <div className="academy-card__body">
                                    <h3 className="academy-card__title">{course.title}</h3>
                                    {course.description && (
                                        <p className="academy-card__desc">{course.description}</p>
                                    )}
                                    <div className="academy-card__meta">
                                        <span>{totalCount} ders</span>
                                        {progressPct === 100 ? (
                                            <span style={{ color: '#059669', fontWeight: 600 }}>Tamamlandı ✓</span>
                                        ) : (
                                            <span>%{progressPct}</span>
                                        )}
                                    </div>
                                    {totalCount > 0 && (
                                        <div className="academy-progress-bar" style={{ marginTop: 8 }}>
                                            <div className="academy-progress-bar__fill" style={{ width: `${progressPct}%` }} />
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
