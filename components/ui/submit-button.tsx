"use client";

import { useFormStatus } from "react-dom";
import type { ButtonHTMLAttributes } from "react";

type SubmitButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: string;
  pendingText?: string;
  variant?: "primary" | "dark" | "outline" | "danger" | "secondary";
  size?: "default" | "sm";
  className?: string;
};

const variants = {
  primary: "bg-payscribe-blue text-white hover:bg-[#254f93]",
  dark: "bg-neutral-950 text-white hover:bg-neutral-800",
  outline:
    "border border-neutral-300 bg-white text-neutral-800 hover:border-payscribe-blue hover:text-payscribe-blue",
  danger: "bg-red-700 text-white hover:bg-red-800",
  secondary:
    "border border-neutral-300 bg-white text-neutral-800 hover:border-neutral-400 hover:bg-neutral-50"
};

const sizes = {
  default: "px-4 py-2 text-sm",
  sm: "px-3 py-2 text-xs"
};

export function SubmitButton({
  children,
  pendingText = "Working...",
  variant = "primary",
  size = "default",
  className = "",
  disabled,
  ...props
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isDisabled = pending || disabled;

  return (
    <button
      {...props}
      type="submit"
      disabled={isDisabled}
      aria-disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-2 rounded font-semibold transition disabled:cursor-not-allowed disabled:opacity-70 ${variants[variant]} ${sizes[size]} ${className}`}
    >
      {pending ? (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : null}
      <span>{pending ? pendingText : children}</span>
    </button>
  );
}
