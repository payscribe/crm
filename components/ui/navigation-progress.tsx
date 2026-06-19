"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function isModifiedClick(event: MouseEvent) {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export function NavigationProgress() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isLoading, setIsLoading] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => setIsLoading(false), 150);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [pathname, searchParams]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (event.defaultPrevented || isModifiedClick(event)) {
        return;
      }

      const target = event.target as Element | null;
      const link = target?.closest("a[href]");

      if (!link) {
        return;
      }

      const href = link.getAttribute("href");
      const targetAttr = link.getAttribute("target");

      if (!href || href.startsWith("#") || targetAttr === "_blank") {
        return;
      }

      const url = new URL(href, window.location.href);

      if (url.origin !== window.location.origin) {
        return;
      }

      if (`${url.pathname}${url.search}` === `${window.location.pathname}${window.location.search}`) {
        return;
      }

      setIsLoading(true);
    }

    function handleSubmit(event: SubmitEvent) {
      if (event.defaultPrevented) {
        return;
      }

      setIsLoading(true);
    }

    document.addEventListener("click", handleClick);
    document.addEventListener("submit", handleSubmit);

    return () => {
      document.removeEventListener("click", handleClick);
      document.removeEventListener("submit", handleSubmit);
    };
  }, []);

  if (!isLoading) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-50">
      <div className="h-1 w-full overflow-hidden bg-payscribe-blue/10">
        <div className="h-full w-1/3 animate-payscribe-progress rounded-r bg-payscribe-blue" />
      </div>
      <div className="absolute right-4 top-3 flex items-center gap-2 rounded border border-neutral-200 bg-white px-3 py-2 text-xs font-semibold text-neutral-700 shadow-sm">
        <span className="h-3 w-3 animate-spin rounded-full border-2 border-payscribe-blue border-t-transparent" />
        Loading
      </div>
    </div>
  );
}
