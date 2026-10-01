import { useMemo } from "react";

export type FieldTaskState = "loading" | "error" | "no_flocks" | "no_stock" | "ready";

export type FieldTaskStateInput = {
  listLoading: boolean;
  stockLoading?: boolean;
  error: string | null;
  flockCount: number;
  availableStockCount?: number;
  /** When false, skip no_stock state (check-in, mortality, home). */
  needsStock?: boolean;
};

export function resolveFieldTaskState(input: FieldTaskStateInput): FieldTaskState {
  const stockLoading = input.needsStock ? (input.stockLoading ?? false) : false;
  if (input.listLoading || stockLoading) return "loading";
  if (input.error) return "error";
  if (input.flockCount === 0) return "no_flocks";
  if (input.needsStock && (input.availableStockCount ?? 0) === 0) return "no_stock";
  return "ready";
}

export function useFieldTaskState(input: FieldTaskStateInput): FieldTaskState {
  return useMemo(
    () => resolveFieldTaskState(input),
    [
      input.listLoading,
      input.stockLoading,
      input.error,
      input.flockCount,
      input.availableStockCount,
      input.needsStock,
    ]
  );
}
