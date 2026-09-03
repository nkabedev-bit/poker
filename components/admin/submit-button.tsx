"use client";

import { useFormStatus } from "react-dom";
import type { ReactNode } from "react";

type SubmitButtonProps = {
  children: ReactNode;
  pendingText?: ReactNode;
  className?: string;
  disabled?: boolean;
  /** Sends this button's submit to a different action than the form's own. */
  formAction?: (formData: FormData) => void | Promise<void>;
};

export function SubmitButton({
  children,
  pendingText,
  className,
  disabled,
  formAction,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className={className}
      disabled={disabled || pending}
      formAction={formAction}
      type="submit"
    >
      {pending ? (pendingText ?? children) : children}
    </button>
  );
}
