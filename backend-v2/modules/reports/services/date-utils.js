// ── Ortak tarih yardımcıları ──
// Tüm "bugün" hesapları Europe/Istanbul gününü baz alır. Çıplak
// toISOString() UTC günü verir: İstanbul'da 00:00–03:00 arasında bir önceki
// güne düşer (son tarih kontrolü, dönem penceresi vb. bir gün kayardı).

/** Bugünün tarihi "YYYY-MM-DD" (Europe/Istanbul). */
export function bugunStr() {
  // en-CA locale YYYY-MM-DD üretir
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Istanbul' });
}

/** İki "YYYY-MM-DD" arasındaki gün farkı (bugun - tarih). */
export function gunFarki(tarih, bugun) {
  return Math.floor((new Date(bugun) - new Date(tarih)) / 86400000);
}

/** "YYYY-MM-DD" → { year, month, day } (Google Business API tarih objesi bekler). */
export function tarihObj(s) {
  const [y, m, d] = s.split('-').map(Number);
  return { year: y, month: m, day: d };
}
