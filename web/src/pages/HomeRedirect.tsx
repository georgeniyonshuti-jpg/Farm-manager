import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { defaultHomeForUser } from "../routes/ProtectedRoute";

export function HomeRedirect() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={defaultHomeForUser(user.role)} replace />;
}
