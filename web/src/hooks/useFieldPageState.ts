import { useMemo } from "react";

export type FieldPageState =
  | "loading"
  | "error"
  | "no_flocks"
  | "no_stock"
  | "ready";

export type FieldPageStateInput = {
  listLoading: boolean;
  stockLoading: boolean;
  error: string | null;
  flockCount: number;
  availableStockCount: number;
};

export function resolveFieldPageState(input: FieldPageStateInput): FieldPageState {
  if (input.listLoading || input.stockLoading) return "loading";
  if (input.error) return "error";
  if (input.flockCount === 0) return "no_flocks";
  if (input.availableStockCount === 0) return "no_stock";
  return "ready";
}

export function useFieldPageState(input: FieldPageStateInput): FieldPageState {
  return useMemo(() => resolveFieldPageState(input), [
    input.listLoading,
    input.stockLoading,
    input.error,
    input.flockCount,
    input.availableStockCount,
  ]);
}
