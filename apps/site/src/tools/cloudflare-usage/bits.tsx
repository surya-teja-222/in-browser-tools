import { WarningCircleIcon } from "@phosphor-icons/react";
import type { ReactNode } from "react";

export function Panel({ children }: { children: ReactNode }) {
  return <div className="rounded-panel border border-rule bg-surface p-6 sm:p-8">{children}</div>;
}

export function ErrorLine({ children }: { children: ReactNode }) {
  return (
    <p role="alert" className="flex max-w-[70ch] gap-2 text-danger">
      <WarningCircleIcon className="mt-0.5 size-5 shrink-0" aria-hidden="true" /> {children}
    </p>
  );
}
