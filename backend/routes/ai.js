import { Router } from 'express';
import { verifyToken, requirePermission } from '../middleware/auth.js';
import asyncHandler from '../utils/asyncHandler.js';

const router = Router();

const AI_BASE_URL = process.env.AI_BASE_URL || 'http://127.0.0.1:8045/v1';
const AI_API_KEY = process.env.AI_API_KEY || 'sk-960dd73e5bb54bef83c27794a70f2cf4';
const AI_MODEL = process.env.AI_MODEL || 'gemini-2.5-flash';

/**
 * POST /api/ai/generate-description
 * Ürün adına göre AI ile açıklama oluştur
 * Body: { ad, kategori?, miktar?, birim? }
 */
router.post(
    '/generate-description',
    verifyToken,
    requirePermission('products.edit'),
    asyncHandler(async (req, res) => {
        const { ad, kategori, miktar, birim } = req.body;

        if (!ad || !ad.trim()) {
            return res.status(400).json({ error: 'Ürün adı zorunludur' });
        }

        let urunBilgi = `Ürün adı: "${ad.trim()}"`;
        if (kategori) urunBilgi += `, Kategori: "${kategori}"`;
        if (miktar && birim) urunBilgi += `, Porsiyon: ${miktar}${birim}`;

        const systemPrompt = `Sen bir Türk tatlı dükkanı olan "Sütlüce Kadayıf" için menü açıklamaları yazan bir metin yazarısın. Görevin, verilen ürün bilgisine göre iştah açıcı, samimi ve doğal bir ürün açıklaması yazmak.

Kurallar:
- Tam olarak 1-2 cümle yaz, toplamda 50-60 karakter olmalı
- Sadece Türkçe yaz
- Ürünün tadını, dokusunu veya sunumunu anlat
- Emoji kullanma, tırnak işareti kullanma
- Sadece açıklama metnini yaz, başka hiçbir şey ekleme`;

        const userPrompt = `${urunBilgi}\n\nBu ürün için 50-60 karakter uzunluğunda bir menü açıklaması yaz:`;

        try {
            const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AI_API_KEY}`,
                },
                body: JSON.stringify({
                    model: AI_MODEL,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                    max_tokens: 500,
                    temperature: 0.8,
                }),
            });

            if (!response.ok) {
                const errText = await response.text();
                console.error('AI API hatası:', response.status, errText);
                return res.status(502).json({ error: 'AI servisi yanıt vermedi' });
            }

            const data = await response.json();
            const description = data.choices?.[0]?.message?.content?.trim() || '';

            res.json({ description });
        } catch (err) {
            console.error('AI bağlantı hatası:', err.message);
            res.status(502).json({ error: 'AI servisine bağlanılamadı' });
        }
    })
);

export default router;
