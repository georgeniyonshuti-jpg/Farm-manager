import { z } from "zod";

// PROD-FIX: prevents malformed data and injection
export const loginSchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(256),
});

// PROD-FIX: prevents malformed data and injection
export const dailyLogSchema = z.object({
  flockId: z.string().min(1).max(120),
  logDate: z.string().min(8).max(32),
  mortality: z.coerce.number().min(0).optional(),
});

// PROD-FIX: prevents malformed data and injection
export const checkinSchema = z.object({
  photos: z.array(z.string().min(20)).min(1).max(6),
  feedAdequate: z.boolean(),
  waterAdequate: z.boolean(),
  feedKg: z.coerce.number().min(0).max(100000).optional(),
  waterL: z.coerce.number().min(0).max(100000).optional(),
  mortalityAtCheckin: z.coerce.number().min(0).max(100000).optional(),
  notes: z.string().max(4000).optional(),
});

/** Feed log: kg + type + adequacy ticks + optional proof photos (URLs / data URLs). */
export const feedEntrySchema = z.object({
  feedKg: z.coerce.number().min(0.001).max(100000),
  feedType: z.string().min(1).max(120).optional(),
  feedAdequate: z.boolean(),
  waterAdequate: z.boolean(),
  photos: z.array(z.string().min(20)).max(6).optional().default([]),
  notes: z.string().max(4000).optional(),
  recordedAt: z.string().max(40).optional(),
});
