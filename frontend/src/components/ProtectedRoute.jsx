// src/components/ProtectedRoute.jsx
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";   // ← correct: go UP one level

export default function ProtectedRoute({ children }) {
  const { currentUser, authLoading } = useAuth();

  if (authLoading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "#060d18",
        color: "#ef4444", fontFamily: "monospace",
        fontSize: 13, letterSpacing: 4,
      }}>
        NexaMed LOADING…
      </div>
    );
  }

  return currentUser ? children : <Navigate to="/login" replace />;
}