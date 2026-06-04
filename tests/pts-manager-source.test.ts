import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("PtsManager source", () => {
  it("does not put templateKind name/value on the server action button", () => {
    const source = readFileSync("components/admin/pts-manager.tsx", "utf8");
    const actionButtonStart = source.indexOf("formAction={savePtsTemplate}");
    const actionButtonEnd = source.indexOf("</button>", actionButtonStart);
    const actionButton = source.slice(actionButtonStart, actionButtonEnd);

    expect(actionButton).not.toContain('name="templateKind"');
    expect(actionButton).not.toContain("value={templateDialog}");
    expect(source).toContain('name="templateKind"');
  });

  it("asks for template name with a custom popup and never uses prompt", () => {
    const source = readFileSync("components/admin/pts-manager.tsx", "utf8");

    expect(source).not.toContain("window.prompt");
    expect(source).toContain("<h3>Укажите название шаблона</h3>");
    expect(source).toContain('placeholder="Название шаблона"');
    expect(source).toContain('name="templateName" type="hidden"');
  });
});
