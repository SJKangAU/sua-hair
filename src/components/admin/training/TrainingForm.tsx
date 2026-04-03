// TrainingForm.tsx
// Form to create an after-hours training session
// Only Steve can be the trainer (isTrainer flag on stylist)
// Trainee is any junior or senior stylist
// Sessions are saved as bookings with bookingType: 'training'
// Saved outside trading hours — no slot conflict checking needed

import { useState } from 'react';
import { collection, doc, setDoc } from 'firebase/firestore';
import { db } from '../../../lib/firebase';
import { useSalonData } from '../../../context/SalonDataContext';
import type { Booking } from '../../../types';

interface Props {
  onSuccess: (message: string) => void;
  onError: (message: string) => void;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '0.65rem',
  border: '1px solid #ddd',
  borderRadius: '6px',
  fontSize: '0.9rem',
  boxSizing: 'border-box',
  marginTop: '0.25rem',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  marginBottom: '1rem',
  fontWeight: 500,
  fontSize: '0.875rem',
  color: '#1a1a1a',
};

// Common training topics for quick selection
const TRAINING_TOPICS = [
  'Cutting technique',
  'Colour application',
  'Balayage technique',
  'Digital perm process',
  'Client consultation',
  'Blow wave styling',
  'Business skills',
  'Custom topic',
];

// After-hours time slots (before 10am and after 6pm)
const AFTER_HOURS_SLOTS = [
  '7:00 AM', '7:30 AM', '8:00 AM', '8:30 AM', '9:00 AM', '9:30 AM',
  '6:00 PM', '6:30 PM', '7:00 PM', '7:30 PM', '8:00 PM', '8:30 PM',
  '9:00 PM',
];

const DURATIONS = [
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '1.5 hours', value: 90 },
  { label: '2 hours', value: 120 },
  { label: '2.5 hours', value: 150 },
  { label: '3 hours', value: 180 },
];

const TrainingForm = ({ onSuccess, onError }: Props) => {
  const { stylists } = useSalonData();
  const [submitting, setSubmitting] = useState(false);
  const [customTopic, setCustomTopic] = useState('');

  const [form, setForm] = useState({
    trainerId: '',
    traineeId: '',
    topic: '',
    date: '',
    time: '',
    duration: 60,
    notes: '',
  });

  // Only Steve (isTrainer) can be a trainer
  const trainers = stylists.filter(s => s.isTrainer);

  // Trainees are everyone except the trainer
  const trainees = stylists.filter(s => s.id !== form.trainerId);

  const selectedTrainer = stylists.find(s => s.id === form.trainerId);
  const selectedTrainee = stylists.find(s => s.id === form.traineeId);

  const effectiveTopic = form.topic === 'Custom topic' ? customTopic : form.topic;

  const handleSubmit = async () => {
    if (!form.trainerId || !form.traineeId || !effectiveTopic || !form.date || !form.time) {
      onError('Please fill in all required fields.');
      return;
    }
    if (!selectedTrainer || !selectedTrainee) return;

    setSubmitting(true);
    try {
      const booking: Omit<Booking, 'id'> = {
        bookingType: 'training',
        status: 'confirmed',
        customerName: selectedTrainee.name,
        customerPhone: '',
        stylistId: selectedTrainer.id,
        stylistName: selectedTrainer.name,
        stylistLevel: selectedTrainer.level,
        serviceId: 'training',
        serviceName: effectiveTopic,
        servicePrice: 0,
        activeTime: form.duration,
        restTime: 0,
        totalTime: form.duration,
        date: form.date,
        time: form.time,
        notes: form.notes,
        traineeId: selectedTrainee.id,
        traineeName: selectedTrainee.name,
        trainingTopic: effectiveTopic,
        createdAt: new Date().toISOString(),
      };

      const timestamp = Date.now();
      const docId = `${form.date}_training_${selectedTrainee.name.replace(/\s+/g, '-').toLowerCase()}_${timestamp}`;
      await setDoc(doc(collection(db, 'bookings'), docId), booking);

      onSuccess(`Training session created — ${selectedTrainer.name} → ${selectedTrainee.name}: ${effectiveTopic}`);

      // Reset form
      setForm({ trainerId: '', traineeId: '', topic: '', date: '', time: '', duration: 60, notes: '' });
      setCustomTopic('');
    } catch (err) {
      console.error('Error creating training session:', err);
      onError('Failed to create training session. Please try again.');
    }
    setSubmitting(false);
  };

  return (
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '1.5rem',
      boxShadow: '0 1px 4px rgba(0,0,0,0.07)',
      border: '1px solid #f0f0f0',
    }}>
      <h3 style={{ margin: '0 0 1.25rem', fontSize: '1rem', fontWeight: 600 }}>
        🎓 New Training Session
      </h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 1rem' }}>

        {/* Trainer */}
        <label style={labelStyle}>
          Trainer *
          <select
            style={inputStyle}
            value={form.trainerId}
            onChange={e => setForm(prev => ({ ...prev, trainerId: e.target.value, traineeId: '' }))}
          >
            <option value="">Select trainer...</option>
            {trainers.map(s => (
              <option key={s.id} value={s.id}>{s.name} — {s.role}</option>
            ))}
          </select>
        </label>

        {/* Trainee */}
        <label style={labelStyle}>
          Trainee *
          <select
            style={inputStyle}
            value={form.traineeId}
            onChange={e => setForm(prev => ({ ...prev, traineeId: e.target.value }))}
            disabled={!form.trainerId}
          >
            <option value="">Select trainee...</option>
            {trainees.map(s => (
              <option key={s.id} value={s.id}>{s.name} — {s.role}</option>
            ))}
          </select>
        </label>

        {/* Date */}
        <label style={labelStyle}>
          Date *
          <input
            style={inputStyle}
            type="date"
            value={form.date}
            min={new Date().toISOString().split('T')[0]}
            onChange={e => setForm(prev => ({ ...prev, date: e.target.value }))}
          />
        </label>

        {/* Time */}
        <label style={labelStyle}>
          Start Time *
          <select
            style={inputStyle}
            value={form.time}
            onChange={e => setForm(prev => ({ ...prev, time: e.target.value }))}
          >
            <option value="">Select time...</option>
            {AFTER_HOURS_SLOTS.map(slot => (
              <option key={slot} value={slot}>{slot}</option>
            ))}
          </select>
        </label>
      </div>

      {/* Topic */}
      <label style={labelStyle}>
        Training Topic *
        <select
          style={inputStyle}
          value={form.topic}
          onChange={e => setForm(prev => ({ ...prev, topic: e.target.value }))}
        >
          <option value="">Select topic...</option>
          {TRAINING_TOPICS.map(topic => (
            <option key={topic} value={topic}>{topic}</option>
          ))}
        </select>
      </label>

      {/* Custom topic input */}
      {form.topic === 'Custom topic' && (
        <label style={labelStyle}>
          Custom Topic *
          <input
            style={inputStyle}
            type="text"
            placeholder="Describe the training topic..."
            value={customTopic}
            onChange={e => setCustomTopic(e.target.value)}
          />
        </label>
      )}

      {/* Duration */}
      <label style={labelStyle}>
        Duration *
        <select
          style={inputStyle}
          value={form.duration}
          onChange={e => setForm(prev => ({ ...prev, duration: Number(e.target.value) }))}
        >
          {DURATIONS.map(d => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
      </label>

      {/* Notes */}
      <label style={labelStyle}>
        Notes (optional)
        <textarea
          style={{ ...inputStyle, height: '70px', resize: 'vertical' }}
          placeholder="Any additional details about the session..."
          value={form.notes}
          onChange={e => setForm(prev => ({ ...prev, notes: e.target.value }))}
        />
      </label>

      <button
        onClick={handleSubmit}
        disabled={submitting}
        style={{
          width: '100%',
          padding: '0.75rem',
          background: submitting ? '#ddd' : '#1a1a1a',
          color: submitting ? '#999' : 'white',
          border: 'none',
          borderRadius: '6px',
          cursor: submitting ? 'not-allowed' : 'pointer',
          fontWeight: 500,
          fontSize: '0.95rem',
        }}
      >
        {submitting ? 'Creating...' : 'Create Training Session'}
      </button>
    </div>
  );
};

export default TrainingForm;