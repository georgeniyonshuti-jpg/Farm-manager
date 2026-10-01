import type { ReactNode } from "react";
import { EmptyState } from "../EmptyState";

type Props = {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
};

/** Single blocked-state panel for field task pages (no alert stacking). */
export function FieldBlockedScreen({ title, description, action, icon }: Props) {
  return (
    <EmptyState variant="compact" title={title} description={description} action={action} icon={icon} />
  );
}
