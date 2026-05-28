import { useLayoutEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/Toast";
import { defaultHomeForUser } from "./ProtectedRoute";

const ACCESS_DENIED_MESSAGE = "You don't have access to open that page.";

/** Redirect to role home and show a one-time info toast (replaces full-page /unauthorized). */
export function AccessDeniedRedirect() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const notifiedRef = useRef(false);

  useLayoutEffect(() => {
    if (notifiedRef.current) return;
    notifiedRef.current = true;
    showToast("info", ACCESS_DENIED_MESSAGE);
  }, [showToast]);

  const home = user ? defaultHomeForUser(user.role) : "/login";
  return <Navigate to={home} replace />;
}
