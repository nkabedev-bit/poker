"use client";

import type { ReactNode } from "react";

type ConfirmFormProps = {
  action: (payload: FormData) => void;
  confirmMessage: string;
  children: ReactNode;
  className?: string;
};

export function ConfirmForm({ action, confirmMessage, children, className }: ConfirmFormProps) {
  return (
    <form
      action={action}
      className={className}
      onSubmit={(e) => {
        if (!window.confirm(confirmMessage)) {
          e.preventDefault();
        }
      }}
    >
      {children}
    </form>
  );
}
