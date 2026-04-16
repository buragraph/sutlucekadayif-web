import { Search } from 'lucide-react';

export default function SearchInput({ value, onChange, placeholder = 'Ara...', className = '' }) {
    return (
        <div className={`admin-search ${className}`}>
            <Search size={16} className="admin-search__icon" />
            <input
                type="text"
                className="admin-search__input"
                placeholder={placeholder}
                value={value}
                onChange={(e) => onChange(e.target.value)}
            />
        </div>
    );
}
