import { useSyncExternalStore } from "react";
import type { RecruitmentContact } from "../../../api/marketInsights.api";

type Listener = () => void;

let rows: RecruitmentContact[] = [];
let moving = new Set<string>();
let revision = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: Listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useRecruitmentBoard() {
  return useSyncExternalStore(subscribe, () => rows, () => rows);
}

export function useBoardRevision() {
  return useSyncExternalStore(subscribe, () => revision, () => revision);
}

export function useMovingIds() {
  return useSyncExternalStore(subscribe, () => moving, () => moving);
}

export function isCardMoving(id: string) {
  return moving.has(id);
}

export function setBoardRows(next: RecruitmentContact[]) {
  rows = next;
  emit();
}

export function beginMove(id: string, patch: Partial<RecruitmentContact>) {
  const prev = rows.find((row) => row.id === id) || null;
  const nextMoving = new Set(moving);
  nextMoving.add(id);
  moving = nextMoving;
  if (prev) rows = rows.map((row) => (row.id === id ? { ...row, ...patch } : row));
  emit();
  return prev;
}

export function rollbackMove(id: string, prev: RecruitmentContact | null) {
  const nextMoving = new Set(moving);
  nextMoving.delete(id);
  moving = nextMoving;
  if (prev) rows = rows.map((row) => (row.id === id ? prev : row));
  emit();
}

export function finishMove(id: string, contact?: RecruitmentContact | null) {
  const nextMoving = new Set(moving);
  nextMoving.delete(id);
  moving = nextMoving;
  if (contact) rows = rows.map((row) => (row.id === id ? { ...row, ...contact } : row));
  revision += 1;
  emit();
}
