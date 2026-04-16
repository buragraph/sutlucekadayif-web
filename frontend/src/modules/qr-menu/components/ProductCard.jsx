import { proxyImageUrl } from '../../../utils/imageProxy';

export default function ProductCard({ product }) {
    const { ad, fiyat, gorsel, aciklama, etiket } = product;

    return (
        <div className="product-card">
            {gorsel ? (
                <img src={proxyImageUrl(gorsel)} alt={ad} className="product-image" loading="lazy" />
            ) : (
                <div className="product-image-placeholder">🍮</div>
            )}
            <div className="product-info">
                <h3>{ad}</h3>
                {aciklama && <p className="description">{aciklama}</p>}
                <div className="price-row">
                    <span className="price">{fiyat} ₺</span>
                    {etiket && etiket.length > 0 && (
                        <div className="tags">
                            {etiket.map((tag, i) => (
                                <span key={i} className="product-tag">{tag}</span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
