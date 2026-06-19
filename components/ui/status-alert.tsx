"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

type StatusAlertProps = {
  type: "error" | "success" | "warning";
  message?: string;
};

const styles = {
  error: "border-red-200 bg-red-50 text-red-700",
  success: "border-green-200 bg-green-50 text-green-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800"
};

export function StatusAlert({ type, message }: StatusAlertProps) {
  const router = useRouter();
  const refreshedMessage = useRef<string | null>(null);

  useEffect(() => {
    if (type !== "success" || !message || refreshedMessage.current === message) {
      return;
    }

    refreshedMessage.current = message;
    router.refresh();
  }, [message, router, type]);

  if (!message) {
    return null;
  }

  return (
    <div className={`mt-6 rounded border px-4 py-3 text-sm ${styles[type]}`}>
      {message}
    </div>
  );
}
