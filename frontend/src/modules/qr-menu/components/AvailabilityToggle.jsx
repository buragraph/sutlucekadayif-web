import { useState } from 'react';
import api from '../../../services/api';

export default function AvailabilityToggle({ urunId, subeSlug, initialMevcut }) {
    const [mevcut, setMevcut] = useState(initialMevcut);
    const [loading, setLoading] = useState(false);

    async function handleToggle() {
        setLoading(true);
        try {
            const yeniDurum = !mevcut;
            await api.put(`/products/${urunId}/availability`, {
                subeSlug,
                mevcut: yeniDurum,
            });
            setMevcut(yeniDurum);
        } catch (err) {
            console.error('Toggle hatası:', err);
        }
        setLoading(false);
    }

    return (
        <button
            onClick={handleToggle}
            disabled={loading}
            style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 12px',
                borderRadius: 20,
                border: 'none',
                cursor: loading ? 'wait' : 'pointer',
                background: mevcut ? '#dcfce7' : '#fee2e2',
                color: mevcut ? '#16a34a' : '#dc2626',
                transition: 'all 0.15s',
                opacity: loading ? 0.6 : 1,
                whiteSpace: 'nowrap',
            }}
        >
            {loading ? '...' : mevcut ? '✓ Mevcut' : '✗ Mevcut Değil'}
        </button>
    );
}
