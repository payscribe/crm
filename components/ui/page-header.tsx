import type { ReactNode } from "react";

type PageHeaderProps = {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
};

export function PageHeader({
  eyebrow,
  title,
  description,
  actions
}: PageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 border-b border-neutral-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold uppercase tracking-wide text-payscribe-blue">
          {eyebrow}
        </p>
        <h2 className="mt-2 break-words text-2xl font-semibold tracking-normal text-neutral-950">
          {title}
        </h2>
        <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-neutral-600">
          {description}
        </p>
      </div>
      {actions ? <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">{actions}</div> : null}
    </div>
  );
}
