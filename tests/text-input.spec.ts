import { expect, test } from "@playwright/test";

test("finishes Chinese composition before switching to the virtual editor", async ({
  page,
}) => {
  const before = "a".repeat(32_767);
  const after = before + "你好";
  await page.goto("/?model=o200k_base");
  const input = page.getByRole("textbox", { name: "Input text", exact: true });
  await input.fill(before);
  await expect(input).toHaveAttribute("data-editor-kind", "native");
  await input.press("Control+End");
  // Reproduce an IME sequence crossing the editor threshold. Migrating during
  // composition would detach the composing textarea and lose the final commit.
  await input.evaluate((element, value) => {
    element.dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true })
    );
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )!.set!.call(element, value);
    element.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        isComposing: true,
        inputType: "insertCompositionText",
        data: "你好",
      })
    );
  }, after);
  await expect(input).toHaveAttribute("data-editor-kind", "native");
  expect(
    await input.evaluate((element) => (element as HTMLTextAreaElement).readOnly)
  ).toBe(false);
  expect(await input.inputValue()).toBe(after);
  await input.evaluate((element) =>
    element.dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true, data: "你好" })
    )
  );
  await expect(input).toHaveAttribute("data-editor-kind", "codemirror");
  await expect(input).toHaveAttribute("data-editor-ready", "true");
  await expect(input).toHaveAttribute(
    "data-source-length",
    String(after.length)
  );
  await input.press("Control+End");
  await expect(input).toContainText("你好");
  await input.press("Control+z");
  await expect(input).toHaveAttribute(
    "data-source-length",
    String(before.length)
  );
  await input.press("Control+y");
  await expect(input).toHaveAttribute(
    "data-source-length",
    String(after.length)
  );
  await expect(
    page.getByLabel("Tokenized text", { exact: true })
  ).toHaveAttribute("data-source-length", String(after.length));
  await expect(page.getByRole("alert")).toHaveCount(0);
});
