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
  /**
   * What this particular button contributes to the form, when one form carries several
   * of them — the row of a list, say, each pressing the same action about itself.
   */
  name?: string;
  value?: string;
};

export function SubmitButton({
  children,
  pendingText,
  className,
  disabled,
  formAction,
  name,
  value,
}: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      className={className}
      disabled={disabled || pending}
      formAction={formAction}
      name={name}
      type="submit"
      value={value}
    >
      {pending ? (pendingText ?? children) : children}
    </button>
  );
}
