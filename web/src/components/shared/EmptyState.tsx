import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center pt-16 px-6">
      <div style={{ opacity: 0.3 }}>{icon}</div>
      <p className="mt-4 text-lg font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground text-center">{subtitle}</p>
    </div>
  );
}
