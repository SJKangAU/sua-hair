// BulkActions.tsx
// Bulk action bar shown when bookings are selected
// Currently supports bulk confirm for pending bookings
// Designed to be extended with additional bulk actions in future

interface Props {
  selectedCount: number;
  onConfirmAll: () => void;
  onCancelAll: () => void;
  onClearSelection: () => void;
}

const BulkActions = ({ selectedCount, onConfirmAll, onCancelAll, onClearSelection }: Props) => {
  if (selectedCount === 0) return null;

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      padding: '0.75rem 1.25rem',
      background: '#1a1a1a',
      borderRadius: '8px',
      flexWrap: 'wrap',
    }}>
      <span style={{ color: 'white', fontSize: '0.875rem', fontWeight: 500 }}>
        {selectedCount} booking{selectedCount > 1 ? 's' : ''} selected
      </span>

      <div style={{ display: 'flex', gap: '0.5rem', marginLeft: 'auto' }}>
        {/* Bulk confirm */}
        <button
          onClick={onConfirmAll}
          style={{
            padding: '0.4rem 1rem',
            background: '#e1f5ee',
            color: '#085041',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '0.82rem',
          }}
        >
          ✓ Confirm all
        </button>

        {/* Bulk cancel */}
        <button
          onClick={onCancelAll}
          style={{
            padding: '0.4rem 1rem',
            background: '#fcebeb',
            color: '#a32d2d',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 500,
            fontSize: '0.82rem',
          }}
        >
          ✕ Cancel all
        </button>

        {/* Clear selection */}
        <button
          onClick={onClearSelection}
          style={{
            padding: '0.4rem 1rem',
            background: 'none',
            border: '1px solid #555',
            color: '#aaa',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.82rem',
          }}
        >
          Clear
        </button>
      </div>
    </div>
  );
};

export default BulkActions;