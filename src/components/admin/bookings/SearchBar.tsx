// SearchBar.tsx
// Debounced search input for the bookings tab
// Searches by customer name and phone number simultaneously
// 300ms debounce prevents excessive re-renders while typing

import { useState, useEffect } from 'react';

interface Props {
  onSearch: (query: string) => void;
  placeholder?: string;
}

const SearchBar = ({ onSearch, placeholder = 'Search by name or phone...' }: Props) => {
  const [value, setValue] = useState('');

  // Debounce — only call onSearch 300ms after user stops typing
  useEffect(() => {
    const timer = setTimeout(() => onSearch(value.trim()), 300);
    return () => clearTimeout(timer);
  }, [value, onSearch]);

  return (
    <div style={{ position: 'relative', flex: 1 }}>
      {/* Search icon */}
      <span style={{
        position: 'absolute',
        left: '0.75rem',
        top: '50%',
        transform: 'translateY(-50%)',
        color: '#6b6b6b',
        fontSize: '0.9rem',
        pointerEvents: 'none',
      }}>
        🔍
      </span>
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        placeholder={placeholder}
        style={{
          width: '100%',
          padding: '0.6rem 0.75rem 0.6rem 2.25rem',
          border: '1px solid #ccc',
          borderRadius: '6px',
          fontSize: '0.9rem',
          background: '#1a1a1a',
          color: 'white',
          boxSizing: 'border-box',
          outline: 'none',
        }}
      />
      {/* Clear button */}
      {value && (
        <button
          onClick={() => setValue('')}
          style={{
            position: 'absolute',
            right: '0.75rem',
            top: '50%',
            transform: 'translateY(-50%)',
            background: 'none',
            border: 'none',
            color: '#888',
            cursor: 'pointer',
            fontSize: '0.9rem',
            padding: 0,
          }}
        >
          ✕
        </button>
      )}
    </div>
  );
};

export default SearchBar;