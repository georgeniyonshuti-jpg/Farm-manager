import { Navigate, useLocation } from "react-router-dom";

export function SellYourBirdsPage() {
  const location = useLocation();
  const to = location.hash === "#how" ? "/market#how" : "/market?sell=1";
  return <Navigate to={to} replace />;
}
