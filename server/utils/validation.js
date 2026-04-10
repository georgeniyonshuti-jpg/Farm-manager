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
  feedKg: z.coerce.number().min(0).max(100000).optional(),
  waterL: z.coerce.number().min(0).max(100000).optional(),
  feedAvailable: z.boolean().optional(),
  waterAvailable: z.boolean().optional(),
  mortalityAtCheckin: z.coerce.number().min(0).max(100000).optional(),
  mortalityReportedInMortalityLog: z.boolean().optional(),
  notes: z.string().max(4000).optional(),
});

/** Feed-only entry (no round check-in photos); used for cycle FCR feed sum. */
export const feedEntrySchema = z.object({
  feedKg: z.coerce.number().min(0.001).max(100000),
  notes: z.string().max(4000).optional(),
  recordedAt: z.string().max(40).optional(),
});

export const vetLogSchema = z.object({
  flockId: z.string().min(1).max(120),
  logDate: z.string().min(8).max(32),
  observations: z.string().max(8000).optional(),
  actionsTaken: z.string().max(8000).optional(),
  recommendations: z.string().max(8000).optional(),
});
