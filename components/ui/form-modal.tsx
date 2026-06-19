"use client";

import { useEffect, useId, useState, type ReactNode } from "react";

type FormModalProps = {
  buttonLabel: string;
  title: string;
  description?: string;
  children: ReactNode;
  size?: "default" | "wide";
};

export function FormModal({
  buttonLabel,
  title,
  description,
  children,
  size = "wide"
}: FormModalProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded bg-payscribe-blue px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#254f93]"
      >
        {buttonLabel}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4"
          role="presentation"
        >
          <button
            type="button"
            aria-label="Close modal"
            className="absolute inset-0 h-full w-full cursor-default"
            onClick={() => setOpen(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descriptionId : undefined}
            className={`relative max-h-[92vh] w-full overflow-y-auto rounded-t border border-neutral-200 bg-white shadow-xl sm:rounded ${
              size === "wide" ? "sm:max-w-5xl" : "sm:max-w-2xl"
            }`}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-neutral-200 bg-white px-5 py-4">
              <div>
                <h2 id={titleId} className="text-lg font-semibold text-neutral-950">
                  {title}
                </h2>
                {description ? (
                  <p
                    id={descriptionId}
                    className="mt-1 text-sm leading-6 text-neutral-600"
                  >
                    {description}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded border border-neutral-300 px-3 py-1.5 text-sm font-semibold text-neutral-700 transition hover:border-payscribe-blue hover:text-payscribe-blue"
              >
                Close
              </button>
            </div>
            <div className="p-5">{children}</div>
          </section>
        </div>
      ) : null}
    </>
  );
}
