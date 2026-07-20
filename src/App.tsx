// App.tsx
// Root component — mounts the React Router provider inside the app-level
// error boundary so a render crash shows a recoverable fallback instead of
// a white screen. All routing logic lives in src/router/index.tsx

import { RouterProvider } from "react-router-dom";
import router from "./router";
import ErrorBoundary from "./components/ui/ErrorBoundary";

const App = () => {
  return (
    <ErrorBoundary>
      <RouterProvider router={router} />
    </ErrorBoundary>
  );
};

export default App;
