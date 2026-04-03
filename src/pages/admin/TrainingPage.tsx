// TrainingPage.tsx
// Training tab — manage after-hours training sessions
// Steve trains junior and senior stylists after hours
// Sessions saved as bookings with bookingType: 'training'
// Split into create form (top) and session list (below)

import TrainingForm from '../../components/admin/training/TrainingForm';
import TrainingList from '../../components/admin/training/TrainingList';

interface Props {
  addToast: (message: string, type: 'success' | 'error' | 'warning') => void;
}

const TrainingPage = ({ addToast }: Props) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>

      {/* Header */}
      <div>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 500, margin: '0 0 0.25rem' }}>
          Training Sessions
        </h2>
        <p style={{ fontSize: '0.85rem', color: '#6b6b6b', margin: 0 }}>
          After-hours sessions between Steve and the team. Scheduled outside trading hours.
        </p>
      </div>

      {/* Create form */}
      <TrainingForm
        onSuccess={msg => addToast(msg, 'success')}
        onError={msg => addToast(msg, 'error')}
      />

      {/* Session list */}
      <TrainingList />
    </div>
  );
};

export default TrainingPage;