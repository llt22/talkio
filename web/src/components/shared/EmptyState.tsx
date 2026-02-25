import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center pt-20 px-6">
      <div
        className="h-16 w-16 rounded-full flex items-center justify-center"
        style={{ backgroundColor: "var(--secondary)" }}
      >
        {icon}
      </div>
      <p className="mt-4 text-[16px] font-semibold text-foreground">{title}</p>
      <p className="mt-1 text-[13px] text-muted-foreground text-center leading-relaxed">{subtitle}</p>
    </div>
  );
}
