"use client";

import { useState } from "react";

export function CopyPublicLinkButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    const url = new URL(value, window.location.origin).toString();

    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = url;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <button className="ghost-button" type="button" onClick={copyLink}>
      {copied ? "Скопировано" : "Скопировать ссылку"}
    </button>
  );
}
