export function StoreChip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      className="store-chip"
      data-on={on ? "true" : "false"}
      aria-pressed={on}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
