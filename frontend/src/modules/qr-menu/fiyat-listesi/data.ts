/**
 * `menu-svg.tsx` ve `export-utils.ts` DIŞARIDAN GELDİ — Sütlüce Fiyat Listesi
 * uygulamasının v40 kaynağından OLDUĞU GİBİ kopyalandı (bkz. FIYAT-LISTESI.md).
 * O iki dosyaya dokunmuyoruz ki arkadaşların yeni sürümü çıktığında üzerine
 * kopyalayıp geçelim; uyum katmanı yalnızca bu dosya.
 *
 * Kaynak paketteki `data.ts` 342 satırdı ve kendi katalog/şube/localStorage
 * modelini taşıyordu — bizde o modelin karşılığı zaten var (`urunler`,
 * `kategoriler`, `urun_sube`). Buradaki, yalnızca çizim motorunun ihtiyaç
 * duyduğu asgari yüzey.
 */

export type CategoryType = 'dessert' | 'drink' | 'other';

/** Çizim motorunun beklediği ürün şekli. Bizim ürünlerimiz buna çevrilir. */
export type Product = {
    id: string;
    categoryId?: string;
    category: string;
    name: string;
    price: number;
    kgPrice?: number;
    detail?: string;
    locked: boolean;
    enabled: boolean;
    outputGroup: 'dessert' | 'other';
    categoryType?: CategoryType;
    owner: 'central' | 'branch';
};

export function hasProductPrice(product: Pick<Product, 'price' | 'kgPrice'>) {
    return product.price > 0 || (product.kgPrice ?? 0) > 0;
}

/**
 * Kategori sırası.
 *
 * Kaynak uygulamada bu, koda gömülü katalogdan (`catalog-seed.ts`) türüyordu.
 * Bizde sıra veritabanında (`kategoriler.sira`) ve merkez onu değiştirebiliyor;
 * bu yüzden dizi çizimden önce `kategoriSirasiniAyarla` ile dolduruluyor.
 *
 * Modül düzeyinde tutulmasının sebebi motoru değiştirmemek: `groupProducts`
 * bunu doğrudan içe aktarıyor, parametreye çevirmek beş fonksiyonun imzasını
 * bozardı ve sonraki sürümle birleştirmeyi zorlaştırırdı.
 */
export const categoryOrder: string[] = [];

export function kategoriSirasiniAyarla(adlar: string[]) {
    categoryOrder.length = 0;
    categoryOrder.push(...adlar);
}
