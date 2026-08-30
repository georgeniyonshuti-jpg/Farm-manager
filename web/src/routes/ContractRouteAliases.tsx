import { Navigate, Route, useLocation } from "react-router-dom";
import { CONTRACT_ROUTE_ALIASES } from "../auth/farmBootstrap";

function ContractAliasRedirect({ target }: { target: string }) {
  const location = useLocation();
  return <Navigate to={`../${target}${location.search}${location.hash}`} replace />;
}

/** Map ERP farm_pwa_urls contract paths to existing farm/* routes. */
export function ContractRouteAliases() {
  return (
    <>
      {Object.entries(CONTRACT_ROUTE_ALIASES).map(([contractPath, farmPath]) => (
        <Route
          key={contractPath}
          path={contractPath}
          element={<ContractAliasRedirect target={farmPath} />}
        />
      ))}
    </>
  );
}
