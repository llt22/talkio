import type { ReactNode } from "react";

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  subtitle: string;
}

export function EmptyState({ icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 pt-20">
      <div
        className="flex h-16 w-16 items-center justify-center rounded-full"
        style={{ backgroundColor: "var(--secondary)" }}
      >
        {icon}
      </div>
      <p className="text-foreground mt-4 text-[16px] font-semibold">{title}</p>
      <p className="text-muted-foreground mt-1 text-center text-[13px] leading-relaxed">
        {subtitle}
      </p>
    </div>
  );
}
