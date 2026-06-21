type FeedTypeOption = {
  value: string;
  label: string;
};

type RefOption = {
  value: string;
  label: string;
};

type SupplierOption = {
  id: string;
  name: string;
};

type OdooApprover = {
  id: string;
  displayName: string;
  role: string;
};

type Props = {
  open: boolean;
  busy: boolean;
  canSendToOdoo: boolean;
  feedTypeOptions: FeedTypeOption[];
  procurementReasons: RefOption[];
  suppliers: SupplierOption[];
  approvers: OdooApprover[];
  procQty: string;
  procFeedType: string;
  procReasonCode: string;
  procRef: string;
  procUnitCost: string;
  procSupplierMode: "existing" | "new";
  procSupplierExistingId: string;
  procSupplierNew: string;
  requestedApproverUserId: string;
  onClose: () => void;
  onSubmit: () => void;
  onCreateSupplier: () => Promise<void>;
  setProcQty: (value: string) => void;
  setProcFeedType: (value: string) => void;
  setProcReasonCode: (value: string) => void;
  setProcRef: (value: string) => void;
  setProcUnitCost: (value: string) => void;
  setProcSupplierMode: (value: "existing" | "new") => void;
  setProcSupplierExistingId: (value: string) => void;
  setProcSupplierNew: (value: string) => void;
  setRequestedApproverUserId: (value: string) => void;
};

export function ReceiveStockModal({
  open,
  busy,
  canSendToOdoo,
  feedTypeOptions,
  procurementReasons,
  suppliers,
  approvers,
  procQty,
  procFeedType,
  procReasonCode,
  procRef,
  procUnitCost,
  procSupplierMode,
  procSupplierExistingId,
  procSupplierNew,
  requestedApproverUserId,
  onClose,
  onSubmit,
  onCreateSupplier,
  setProcQty,
  setProcFeedType,
  setProcReasonCode,
  setProcRef,
  setProcUnitCost,
  setProcSupplierMode,
  setProcSupplierExistingId,
  setProcSupplierNew,
  setRequestedApproverUserId,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 px-4 py-6">
      <div className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-xl border border-[var(--border-color)] bg-[var(--surface-card)] p-4 shadow-elevated md:p-5">
        <div className="mb-4 flex items-center justify-between border-b border-[var(--border-color)] pb-3">
          <h2 className="text-base font-semibold text-[var(--text-primary)]">Receive stock</h2>
          <button
            type="button"
            className="rounded-lg border border-[var(--border-color)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Feed type</label>
              <select
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                value={procFeedType}
                onChange={(e) => setProcFeedType(e.target.value)}
              >
                {feedTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Quantity (kg)</label>
              <input
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                placeholder="e.g. 500"
                inputMode="decimal"
                value={procQty}
                onChange={(e) => setProcQty(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Reason</label>
              <select
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                value={procReasonCode}
                onChange={(e) => setProcReasonCode(e.target.value)}
              >
                {procurementReasons.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Reference (GRN / invoice)</label>
              <input
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                placeholder="Optional"
                value={procRef}
                onChange={(e) => setProcRef(e.target.value)}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Unit cost (RWF/kg, optional)</label>
              <input
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                placeholder="e.g. 450"
                inputMode="decimal"
                value={procUnitCost}
                onChange={(e) => setProcUnitCost(e.target.value)}
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Supplier</label>
              <select
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                value={procSupplierMode === "new" ? "__new__" : procSupplierExistingId}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setProcSupplierMode("new");
                    setProcSupplierExistingId("");
                    return;
                  }
                  setProcSupplierMode("existing");
                  setProcSupplierExistingId(e.target.value);
                }}
              >
                <option value="">Select saved supplier</option>
                {suppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </option>
                ))}
                <option value="__new__">+ Add new supplier</option>
              </select>

              {procSupplierMode === "new" ? (
                <div className="mt-2 flex gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                    placeholder="Enter new supplier name"
                    value={procSupplierNew}
                    onChange={(e) => setProcSupplierNew(e.target.value)}
                  />
                  <button
                    type="button"
                    className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)]"
                    onClick={() => void onCreateSupplier()}
                  >
                    Save
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          {!canSendToOdoo ? (
            <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3">
              <label className="mb-1 block text-xs font-medium text-amber-300">Send approval request to</label>
              <select
                className="w-full rounded-lg border border-[var(--border-input)] bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]"
                value={requestedApproverUserId}
                onChange={(e) => setRequestedApproverUserId(e.target.value)}
              >
                <option value="">Select approver</option>
                {approvers.map((approver) => (
                  <option key={approver.id} value={approver.id}>
                    {approver.displayName} ({approver.role})
                  </option>
                ))}
              </select>
              <p className="mt-1 text-[11px] text-amber-300/90">
                You can submit now, but it will only reach Odoo after this approver reviews it in Accounting Approvals.
              </p>
            </div>
          ) : null}

          <div className="flex items-center justify-end gap-2 border-t border-[var(--border-color)] pt-3">
            <button
              type="button"
              className="rounded-lg border border-[var(--border-color)] bg-[var(--surface-input)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--surface-subtle)]"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy || !procQty || (!canSendToOdoo && !requestedApproverUserId)}
              onClick={onSubmit}
              className="rounded-lg bg-[var(--primary-color)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-color-dark)] disabled:opacity-60"
            >
              {busy ? "Saving…" : "Save receipt"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
