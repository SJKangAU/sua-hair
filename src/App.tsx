// App.tsx
// Root component — mounts the React Router provider
// All routing logic lives in src/router/index.tsx

import { RouterProvider } from "react-router-dom";
import router from "./router";

const App = () => {
  return <RouterProvider router={router} />;
};

export default App;
