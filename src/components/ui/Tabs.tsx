// Tabs.tsx
// Reusable tab navigation component for the admin dashboard
// Accepts a list of tabs with icons, labels, and content
// Highlights the active tab and calls onChange when a tab is clicked

interface Tab {
  id: string;
  label: string;
  icon: string;
}

interface Props {
  tabs: Tab[];
  activeTab: string;
  onChange: (tabId: string) => void;
}

const Tabs = ({ tabs, activeTab, onChange }: Props) => {
  return (
    <div style={{
      display: 'flex',
      borderBottom: '2px solid #2a2a2a',
      background: '#1a1a1a',
      padding: '0 1.5rem',
      gap: '0.25rem',
    }}>
      {tabs.map(tab => {
        const active = tab.id === activeTab;
        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            style={{
              padding: '1rem 1.25rem',
              background: 'none',
              border: 'none',
              borderBottom: active ? '2px solid #c9a96e' : '2px solid transparent',
              marginBottom: '-2px',
              color: active ? '#c9a96e' : '#888',
              cursor: 'pointer',
              fontSize: '0.875rem',
              fontWeight: active ? 600 : 400,
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              transition: 'color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            <span style={{ fontSize: '1rem' }}>{tab.icon}</span>
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};

export default Tabs;