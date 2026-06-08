import { useERPNextConnection } from "../../context/OdooConnectionContext";
import { PageHeader } from "../../components/PageHeader";
import { Link } from "react-router-dom";

const DEFAULT_ERPNEXT_URL =
  import.meta.env.VITE_ERPNEXT_URL || "https://erp.clevacredit.com";

export function ERPNextEmbedPage() {
  const { status } = useERPNextConnection();
  const iframeSrc = `${status?.erpnextUrl || DEFAULT_ERPNEXT_URL}/app/farm-manager`;

  if (!status?.connected) {
    return (
      <div className="rounded-xl border border-neutral-200 bg-white p-6 shadow-sm">
        <PageHeader
          title="ERPNext desk"
          subtitle="Connect ERPNext first, then open the embedded accounting workspace."
        />
        <p className="mt-4 text-sm text-neutral-600">
          Go to{" "}
          <Link to="../erpnext-setup" className="text-emerald-700 underline">
            ERPNext integration
          </Link>{" "}
          to configure API keys.
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col gap-2">
      <PageHeader title="ERPNext desk" subtitle="Embedded Farm manager workspace from ERPNext." />
      <iframe
        src={iframeSrc}
        title="ERPNext Farm manager"
        className="min-h-0 flex-1 w-full rounded-xl border border-neutral-200 bg-white"
        allow="fullscreen"
      />
    </div>
  );
}
