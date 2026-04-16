import { useState } from 'react';

export default function CategoryAccordion({ name, count, children }) {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <div className="category-section">
            <div
                className={`category-header ${isOpen ? 'active' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <div>
                    <h2>
                        {name}
                        <span className="item-count">({count})</span>
                    </h2>
                </div>
                <span className="chevron">▼</span>
            </div>
            <div className={`category-items ${isOpen ? 'open' : ''}`}>
                <div className="category-items-inner">
                    {children}
                </div>
            </div>
        </div>
    );
}
