import type { Ref } from "react";
import type { BarnNameOption } from "../../hooks/useBarnNames";

type Props = {
  barnNames: BarnNameOption[];
  mode: "existing" | "new";
  selectedId: string;
  newBarnName: string;
  onModeChange: (mode: "existing" | "new") => void;
  onSelectId: (id: string) => void;
  onNewNameChange: (value: string) => void;
  onSaveNew: () => void | Promise<void>;
  error?: string;
  disabled?: boolean;
  fieldRef?: Ref<HTMLDivElement>;
  selectRef?: Ref<HTMLSelectElement>;
};

export function BarnNameField({
  barnNames,
  mode,
  selectedId,
  newBarnName,
  onModeChange,
  onSelectId,
  onNewNameChange,
  onSaveNew,
  error,
  disabled,
  fieldRef,
  selectRef,
}: Props) {
  return (
    <div ref={fieldRef} className="space-y-1 sm:col-span-2">
      <label className="block text-xs font-medium text-[var(--text-secondary)]">
        Barn name<span className="text-red-500"> *</span>
      </label>
      <select
        ref={selectRef}
        disabled={disabled}
        className={[
          "w-full rounded-lg border bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]",
          error ? "border-red-500 ring-1 ring-red-500/40" : "border-[var(--border-input)]",
        ].join(" ")}
        value={mode === "new" ? "__new__" : selectedId}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "__new__") {
            onModeChange("new");
            onSelectId("");
          } else {
            onModeChange("existing");
            onSelectId(v);
          }
        }}
      >
        <option value="">Select barn name</option>
        {barnNames.map((b) => (
          <option key={b.id} value={b.id}>
            {b.name}
          </option>
        ))}
        <option value="__new__">+ Add new barn name</option>
      </select>
      {mode === "new" ? (
        <div className="flex gap-2">
          <input
            disabled={disabled}
            className={[
              "min-w-0 flex-1 rounded-lg border bg-[var(--surface-input)] px-3 py-2 text-sm text-[var(--text-primary)]",
              error ? "border-red-500 ring-1 ring-red-500/40" : "border-[var(--border-input)]",
            ].join(" ")}
            placeholder="New barn name"
            value={newBarnName}
            onChange={(e) => onNewNameChange(e.target.value)}
          />
          <button
            type="button"
            disabled={disabled}
            className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-xs font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-subtle)] disabled:opacity-60"
            onClick={() => void onSaveNew()}
          >
            Save
          </button>
        </div>
      ) : null}
      {error ? <p className="text-xs text-red-500">{error}</p> : null}
    </div>
  );
}
