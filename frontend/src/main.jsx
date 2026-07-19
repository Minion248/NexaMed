import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/Authoontext";
import ProtectedRoute from "./components/ProtectedRoute";
import LoginPage from "./pages/LoginPage";
import NexaMedApp from "./App";

// Redirect root (no hash fragment) to the static marketing landing page.
// We guard with !window.location.hash so that hash-router paths like
// /#/login and /#/ are NOT redirected — they need to reach the React app.
if (window.location.pathname === '/' && !window.location.hash) {
  window.location.href = '/front.html';
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <NexaMedApp />
              </ProtectedRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>
);