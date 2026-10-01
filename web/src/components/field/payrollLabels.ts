import type { StatusTone } from "../ui/StatusPill";

export function payrollLogTypeLabel(logType: string): string {
  switch (logType) {
    case "check_in":
      return "Round check-in";
    case "feed_entry":
      return "Feed log";
    case "vet_log":
      return "Vet visit";
    case "vet_log":
      return "Vet visit";
    default:
      return logType.replace(/_/g, " ");
  }
}

export function payrollApprovalTone(approvedAt: string | null): StatusTone {
  return approvedAt ? "success" : "warning";
}

export function payrollApprovalLabel(approvedAt: string | null, pending: string, approved: string): string {
  return approvedAt ? approved : pending;
}
