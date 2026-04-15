// TrainingPage.tsx
// Training tab — uses ToastContext directly, no addToast prop needed

import { useToastContext } from "../../context/ToastContext";
import TrainingForm from "../../components/admin/training/TrainingForm";
import TrainingList from "../../components/admin/training/TrainingList";

const TrainingPage = () => {
  const { addToast } = useToastContext();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
      <div>
        <h2
          style={{ fontSize: "1.1rem", fontWeight: 500, margin: "0 0 0.25rem" }}
        >
          Training Sessions
        </h2>
        <p style={{ fontSize: "0.85rem", color: "#6b6b6b", margin: 0 }}>
          After-hours sessions between Steve and the team. Scheduled outside
          trading hours.
        </p>
      </div>
      <TrainingForm
        onSuccess={(msg) => addToast(msg, "success")}
        onError={(msg) => addToast(msg, "error")}
      />
      <TrainingList />
    </div>
  );
};

export default TrainingPage;
