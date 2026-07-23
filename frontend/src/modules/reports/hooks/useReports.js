import { create } from 'zustand';
import { toast } from 'sonner';
import { auth } from '@/firebase';
import { API_BASE } from '@/services/api';

// ── API Base ──
// Taban tek kaynaktan (services/api.js). Dikkat: frontend/.env prod URL'sini
// tanımladığı için lokal geliştirme de BİLİNÇLİ olarak prod API/Firestore'a gider
// (mevcut çalışma şekli). Dev için ayrı ortam açılırsa .env.development ile yönlendirilir.
const API = `${API_BASE}/reports`;

// ── Auth-aware fetch wrapper ──
async function authFetch(url, options = {}) {
    const user = auth.currentUser;
    if (user) {
        const token = await user.getIdToken();
        options.headers = {
            ...options.headers,
            'Authorization': `Bearer ${token}`,
        };
    }
    return fetch(url, options);
}

// ── Formatters ──
export const fmt = (n) => n == null ? '—' : new Intl.NumberFormat('tr-TR').format(Math.round(n));
export const fmtC = (n) => n == null ? '—' : new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
export const fmtS = (n) => { if (n == null) return '—'; if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M'; if (n >= 1e3) return (n / 1e3).toFixed(0) + 'K'; return String(n); };

export function formatDateTR(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length !== 3) return dateStr;
    const months = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
    return `${parseInt(parts[2], 10)} ${months[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
}

// Promise.allSettled sonuçlarını tek toast'a çevirir: hepsi hatalı → error,
// bir kısmı → warning, hiçbiri → success. Koşulsuz başarı toast'ı, çekim
// başarısızken kullanıcıyı bayat veriye güvendiriyordu.
export function toastFetchSonuclari(sonuclar, etiketler, { basari, hepsiHata, kismi } = {}) {
    const hatalar = sonuclar
        .map((r, i) => (r.status === 'rejected' ? `${etiketler[i]}: ${r.reason?.message || 'hata'}` : null))
        .filter(Boolean);
    if (hatalar.length === 0) return toast.success(basari || 'Tamamlandı.');
    if (hatalar.length === sonuclar.length) return toast.error(`${hepsiHata || 'İşlem başarısız'} — ${hatalar.join(' · ')}`);
    return toast.warning(`${kismi || 'Kısmen tamamlandı'} — ${hatalar.join(' · ')}`);
}

// ── Default date range (previous month) ──
function getDefaultDateRange() {
    const now = new Date();
    const curMonth = now.getMonth();
    const curYear = now.getFullYear();
    const prevMonth = curMonth === 0 ? 11 : curMonth - 1;
    const prevYear = curMonth === 0 ? curYear - 1 : curYear;
    const lastDay = new Date(prevYear, prevMonth + 1, 0).getDate();
    const pad = (n) => String(n).padStart(2, '0');
    return {
        since: `${prevYear}-${pad(prevMonth + 1)}-01`,
        until: `${prevYear}-${pad(prevMonth + 1)}-${pad(lastDay)}`,
    };
}

// ── Zustand Store ──
export const useReportsStore = create((set, get) => ({
    // Data
    branches: [],
    onayliKodlar: [],
    activeBranch: null,
    donemCache: {},
    budgetStatus: null,
    settings: {},
    googleMappings: {},
    metaPrefixMappings: {},
    reverseCampaigns: {},
    reverseAdsets: {},
    hasMappings: false,

    // UI state
    loading: false,
    branchLoading: false,
    sortCol: 'donem',
    sortDir: 'desc',
    dateRange: getDefaultDateRange(),
    selectedFilterBranches: [],

    // Modal state
    modals: {
        settings: false,
        addData: false,
        bulkUpload: false,
        addBranch: false,
        editBranch: false,
        dataEdit: false,
        campaignMap: false,
        adsetMap: false,
        preview: false,
    },
    modalData: {},

    // Actions
    setDateRange: (range) => set({ dateRange: range }),
    setSort: (col) => {
        const { sortCol, sortDir } = get();
        if (sortCol === col) {
            set({ sortDir: sortDir === 'asc' ? 'desc' : 'asc' });
        } else {
            set({ sortCol: col, sortDir: 'desc' });
        }
    },

    toggleFilterBranch: (kod) => set((s) => {
        const selected = s.selectedFilterBranches.includes(kod)
            ? s.selectedFilterBranches.filter((k) => k !== kod)
            : [...s.selectedFilterBranches, kod];
        return { selectedFilterBranches: selected };
    }),
    clearFilterBranches: () => set({ selectedFilterBranches: [] }),
    selectAllFilterBranches: (kodlar) => set({ selectedFilterBranches: kodlar }),

    openModal: (name, data = {}) => set((s) => ({
        modals: { ...s.modals, [name]: true },
        modalData: { ...s.modalData, [name]: data },
    })),
    closeModal: (name) => set((s) => ({
        modals: { ...s.modals, [name]: false },
    })),

    setActiveBranch: (kod) => set({ activeBranch: kod }),

    // ── Load Dashboard (tek bundle istek) ──
    loadDashboard: async (force = false) => {
        const { branches } = get();
        if (!force && branches.length > 0) return; // Zaten yüklüyse (sayfalar arası geçişte) API'ye gitme (0 Read)

        set({ loading: true });
        try {
            const res = await authFetch(`${API}/dashboard-bundle`);
            const data = await res.json();

            const newDonemCache = {};
            for (const s of data.subeler) {
                if (s.donemler && s.donemler.length > 0) newDonemCache[s.kod] = s.donemler;
            }

            set((prev) => ({
                branches: data.subeler,
                onayliKodlar: data.onayliKodlar || [],
                hasMappings: data.hasMappings || false,
                reverseCampaigns: data.reverseCampaigns || {},
                reverseAdsets: data.reverseAdsets || {},
                metaPrefixMappings: data.mappings || {},
                settings: data.settings || {},
                googleMappings: data.googleMappings || {},
                // force (veri çekimi sonrası) → eski şube cache'ini TEMİZLE ki tıklayınca taze gelsin
                donemCache: force ? { ...newDonemCache } : { ...prev.donemCache, ...newDonemCache },
                loading: false,
            }));
        } catch (err) {
            console.error('Dashboard load error:', err);
            set({ loading: false });
        }
    },

    // ── Select Branch ──
    // Sidebar stub şubeler (sadece kod+ad) içerir; tıklanınca tam şube (aggregate +
    // donem_ozetleri) /sube/:kod ile lazy çekilir (1 read). Zaten yüklüyse 0 read.
    selectBranch: async (kod, force = false) => {
        set({ activeBranch: kod });
        const { donemCache, branches } = get();

        if (!force && donemCache[kod]) return; // zaten yüklü → 0 read

        // Tam veri şube objesinde hazırsa (ör. sube_sahibi kendi şubesi) API'ye gitme
        const sube = branches.find(b => b.kod === kod);
        if (!force && sube && Array.isArray(sube.donem_ozetleri)) {
            set((s) => ({ donemCache: { ...s.donemCache, [kod]: sube.donem_ozetleri } }));
            return;
        }

        // Lazy: tam şube dokümanını çek (aggregate'ler + donem_ozetleri) — 1 read
        set({ branchLoading: true });
        try {
            const r = await authFetch(`${API}/sube/${kod}`);
            const d = await r.json();
            set((s) => ({
                branches: s.branches.map((b) => (b.kod === kod ? { ...b, ...d.sube } : b)),
                donemCache: { ...s.donemCache, [kod]: (d.sube && d.sube.donem_ozetleri) || [] },
                branchLoading: false,
            }));
        } catch {
            set((s) => ({ donemCache: { ...s.donemCache, [kod]: [] }, branchLoading: false }));
        }
    },

    // ── Lokal cache'den şube aggregate'lerini yeniden hesapla (sidebar anında güncellenir) ──
    recalcBranchFromCache: (kod) => {
        const { donemCache, branches } = get();
        const donemler = donemCache[kod] || [];
        const toplamHarcama = donemler.reduce((sum, d) => sum + (d.harcama || 0), 0);
        set({
            branches: branches.map(b => b.kod === kod 
                ? { ...b, toplamHarcama, donemSayisi: donemler.length }
                : b
            )
        });
    },
}));

// Bütçe durumu yarış koruması: geç dönen eski tam-liste yanıtı, daha yeni bir
// yanıtı (tam liste VEYA hedefli şube merge'i) ezmesin diye her istek sıra
// numarasını ilerletir; tam-liste yazımı yalnızca hâlâ en yeniyse yapılır.
let butceDurumSeq = 0;

// ── Standalone API functions ──
export const reportsApi = {
    async globalMetaFetch(since, until, token) {
        const res = await authFetch(`${API}/campaign-fetch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: token, since, until }),
        });
        const data = await res.json();
        if (res.ok) return data;
        // Fallback to prefix-based
        if (data.error?.includes('eşleştirme')) {
            const res2 = await authFetch(`${API}/quick-fetch-meta`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken: token, since, until }),
            });
            const data2 = await res2.json();
            if (res2.ok) return data2;
            throw new Error(data2.error || 'Hata');
        }
        throw new Error(data.error || 'Hata');
    },

    async globalGoogleFetch(since, until) {
        const res = await authFetch(`${API}/google-fetch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ since, until }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Hata');
        return data;
    },

    async generatePdf(subeKod, donemBaslangic, donemBitis) {
        const res = await authFetch(`${API}/generate-pdf`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subeKod, donemBaslangic, donemBitis }),
        });
        if (!res.ok) {
            const d = await res.json();
            throw new Error(d.error || 'PDF oluşturulamadı');
        }
        const blob = await res.blob();
        const filename = res.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'Rapor.pdf';
        const url = window.URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), { href: url, download: decodeURIComponent(filename) }).click();
        window.URL.revokeObjectURL(url);
    },

    async bulkPdf(subeKodlari, donemBaslangic, donemBitis) {
        const res = await authFetch(`${API}/generate-pdf-bulk`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subeKodlari, donemBaslangic, donemBitis }),
        });
        if (!res.ok) {
            const d = await res.json();
            throw new Error(d.error || 'ZIP oluşturulamadı');
        }
        const blob = await res.blob();
        const filename = res.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'Raporlar.zip';
        const url = window.URL.createObjectURL(blob);
        Object.assign(document.createElement('a'), { href: url, download: decodeURIComponent(filename) }).click();
        window.URL.revokeObjectURL(url);
    },

    async previewReport(subeKod, donemBaslangic, donemBitis) {
        const res = await authFetch(`${API}/preview`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ subeKod, donemBaslangic, donemBitis }),
        });
        if (!res.ok) throw new Error('Önizleme yüklenemedi');
        return await res.text();
    },

    async uploadData(formData) {
        const res = await authFetch(`${API}/upload`, { method: 'POST', body: formData });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Yükleme hatası');
        return data;
    },

    async addBranch({ kod, ad, adres, link }) {
        const res = await authFetch(`${API}/sube`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kod, ad, adres, link }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Hata');
        return d;
    },

    async editBranch(kod, { ad, adres, link }) {
        const res = await authFetch(`${API}/sube/${kod}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ad, adres, link }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Hata');
        return d;
    },

    async deleteBranch(kod) {
        const res = await authFetch(`${API}/sube/${kod}`, { method: 'DELETE' });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Hata');
        return d;
    },

    async deleteDonem(kod, baslangic, bitis) {
        const res = await authFetch(`${API}/sube/${kod}/donem?baslangic=${baslangic}&bitis=${bitis}`, { method: 'DELETE' });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Hata');
        return d;
    },

    async fetchDonemVerileri(kod, baslangic, bitis) {
        const res = await authFetch(`${API}/sube/${kod}/donem/veriler?baslangic=${baslangic}&bitis=${bitis}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Hata');
        return data;
    },

    async saveOverrides(kod, baslangic, bitis, overrides) {
        const res = await authFetch(`${API}/sube/${kod}/donem/overrides`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ baslangic, bitis, overrides }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Hata');
        return d;
    },

    async saveSettings(data) {
        const res = await authFetch(`${API}/save-settings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!res.ok) throw new Error('Kaydedilemedi');
        return await res.json();
    },

    async fetchCampaigns(token, since, until) {
        const res = await authFetch(`${API}/meta-campaigns`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: token, since, until }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Hata');
        return data;
    },

    async saveCampaignMappings(mappings) {
        const res = await authFetch(`${API}/save-campaign-mappings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mappings }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Hata');
        return d;
    },

    async fetchAdsets(token, since, until, forceRefresh = false) {
        const res = await authFetch(`${API}/meta-adsets`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: token, since, until, forceRefresh }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Hata');
        return data;
    },

    async saveAdsetMappings(mappings) {
        const res = await authFetch(`${API}/save-adset-mappings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mappings }),
        });
        const d = await res.json();
        if (!res.ok) throw new Error(d.error || 'Hata');
        return d;
    },

    async fetchMetaMappings() {
        const res = await authFetch(`${API}/meta-mappings`);
        return await res.json();
    },

    async fetchGoogleLocations() {
        const res = await authFetch(`${API}/google-locations`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Hata');
        return data;
    },

    async saveGoogleMappings(mappings) {
        const res = await authFetch(`${API}/google-mappings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mappings }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Google eşleştirmesi kaydedilemedi');
        return data;
    },

    async saveMetaMappings(eslesmeler) {
        const res = await authFetch(`${API}/confirm-meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ saveMappingsOnly: true, eslesmeler }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Meta eşleştirmesi kaydedilemedi');
        return data;
    },

    async previewMeta(token, since, until) {
        const res = await authFetch(`${API}/preview-meta`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: token, since, until }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'API hatası');
        return data;
    },

    async checkGoogleStatus() {
        const res = await authFetch(`${API}/google-status`);
        return await res.json();
    },

    async metaFetchForBranch(token, since, until, subeKod) {
        const res = await authFetch(`${API}/campaign-fetch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ accessToken: token, since, until, subeKod }),
        });
        const data = await res.json();
        if (res.ok) return data;
        if (data.error?.includes('eşleştirme')) {
            const res2 = await authFetch(`${API}/quick-fetch-meta`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accessToken: token, since, until, subeKod }),
            });
            const data2 = await res2.json();
            if (res2.ok) return data2;
            throw new Error(data2.error || 'Hata');
        }
        throw new Error(data.error || 'Hata');
    },

    async googleFetchForBranch(since, until, subeKod) {
        const res = await authFetch(`${API}/google-fetch`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ since, until, subeKod }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Hata');
        return data;
    },

    async fetchBudgetStatus(since, until, subeKod = null) {
        const seq = ++butceDurumSeq;
        const url = `${API}/butce-durum?since=${since}&until=${until}` + (subeKod ? `&subeKod=${subeKod}` : '');
        const res = await authFetch(url);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Hata');

        if (subeKod) {
            // Tek şube yenilemesi: mevcut listede yalnızca o şubenin kaydını değiştir
            useReportsStore.setState((s) => {
                const prev = s.budgetStatus;
                if (!prev?.subeler) return { budgetStatus: data };
                const others = prev.subeler.filter((b) => b.kod !== subeKod);
                return { budgetStatus: { ...prev, subeler: [...others, ...(data.subeler || [])] } };
            });
        } else if (seq === butceDurumSeq) {
            // Daha yeni bir tam-liste isteği başlamadıysa yaz (eski yanıt yenisini ezmesin)
            useReportsStore.setState({ budgetStatus: data });
        }
        return data;
    },

    /**
     * Tek şubeyi tazeler (1 read) — tam dashboard yenileme yerine.
     * Şube dokümanındaki güncel aggregate'leri ve donem_ozetleri'ni
     * store'daki branches + donemCache'e işler.
     */
    async refreshBranch(kod) {
        const res = await authFetch(`${API}/sube/${kod}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Hata');
        useReportsStore.setState((s) => ({
            branches: s.branches.map((b) => (b.kod === kod ? { ...b, ...data.sube } : b)),
            donemCache: { ...s.donemCache, [kod]: data.sube.donem_ozetleri || [] },
        }));
        return data.sube;
    },

    // ── Şube notu (yalnızca yönetici) ──
    // Ayrı uçtan gelir; şube dokümanına dahil DEĞİL, çünkü o doküman şube
    // sahibine de dönüyor (bkz. backend db.js açıklaması).
    async getSubeNot(kod) {
        const res = await authFetch(`${API}/sube/${kod}/not`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Not okunamadı');
        return data;
    },

    async saveSubeNot(kod, not) {
        const res = await authFetch(`${API}/sube/${kod}/not`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ not }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Not kaydedilemedi');
        return data;
    },
};
