import { expect, test, type Locator, type Page } from "@playwright/test";
import { createHash } from "node:crypto";
import { get_encoding } from "tiktoken";

const input = (page: Page) =>
  page.getByRole("textbox", { name: "Input text", exact: true });
const textPane = (page: Page) =>
  page.getByLabel("Tokenized text", { exact: true });
const idPane = (page: Page) => page.getByLabel("Token IDs", { exact: true });
const sha256 = (text: string) =>
  createHash("sha256").update(text, "utf8").digest("hex");

async function setLargeInput(page: Page, text: string) {
  // This verifies million-character application rendering. It intentionally
  // excludes CDP Input.insertText performance and is not a user-paste benchmark.
  await input(page).evaluate((element, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )!.set!;
    setter.call(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }, text);
  await expect(input(page)).toHaveAttribute("data-editor-kind", "codemirror");
  await expect(input(page)).toHaveAttribute("data-editor-ready", "true");
}

function referenceTokens(text: string) {
  const encoder = get_encoding("o200k_base");
  try {
    return Uint32Array.from(encoder.encode(text));
  } finally {
    encoder.free();
  }
}

async function virtualResult(page: Page, textLength: number, count: number) {
  const pane = textPane(page);
  await expect(pane).toHaveAttribute("data-source-length", String(textLength));
  await expect(pane).toHaveAttribute("data-token-count", String(count));
  await expect(pane).toHaveAttribute("data-result-model", "o200k_base");
  await expect(pane).toHaveAttribute("data-virtualized", "true");
  await expect(pane).toHaveAttribute("aria-busy", "false");
  await expect(idPane(page)).toHaveAttribute("data-token-count", String(count));
  await expect(idPane(page)).toHaveAttribute("aria-busy", "false");
}

async function boundedDom(page: Page) {
  expect(await textPane(page).locator("[data-text-line]").count()).toBeLessThan(
    50
  );
  expect(await idPane(page).locator("[data-id-line]").count()).toBeLessThan(50);
  expect(
    await page
      .locator(
        '[aria-label="Tokenized text"] [data-token-segment], [aria-label="Token IDs"] [data-token-segment]'
      )
      .count()
  ).toBeLessThan(2000);
}

test("keeps one million UTF-16 characters and every token while bounding the DOM", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const tail = "end-of-million 世界 👩‍💻 e\u0301";
  const prefixLength = 1_000_000 - tail.length;
  const text =
    "hello ".repeat(Math.ceil(prefixLength / 6)).slice(0, prefixLength) + tail;
  expect(text.length).toBe(1_000_000);
  const expectedTokens = referenceTokens(text);
  await page.goto("/?model=o200k_base");
  await setLargeInput(page, text);
  await virtualResult(page, text.length, expectedTokens.length);
  await expect(
    page.getByText(String(expectedTokens.length), { exact: true })
  ).toBeVisible();
  await boundedDom(page);
  expect(
    await textPane(page).locator("[data-text-line]").count()
  ).toBeGreaterThan(0);
  expect(
    Number(await textPane(page).getAttribute("data-line-count"))
  ).toBeGreaterThan(10_000);

  await textPane(page).focus();
  await textPane(page).press("End");
  await expect(
    textPane(page).locator("[data-text-line]").last()
  ).toHaveAttribute("data-source-end", String(text.length));
  await expect(textPane(page)).toContainText(tail);
  await idPane(page).focus();
  await idPane(page).press("End");
  const finalIdRow = idPane(page).locator("[data-id-line]").last();
  await expect(finalIdRow).toHaveAttribute(
    "data-token-end",
    String(expectedTokens.length)
  );
  const finalTokenStart = Number(
    await finalIdRow.getAttribute("data-token-start")
  );
  expect((await finalIdRow.textContent())?.trim()).toBe(
    expectedTokens.subarray(finalTokenStart).join(", ")
  );
  await boundedDom(page);

  await textPane(page).focus();
  await textPane(page).press("Home");
  await expect(
    textPane(page).locator("[data-text-line]").first()
  ).toHaveAttribute("data-text-line", "0");
  await boundedDom(page);
});

async function visibleGeometry(pane: Locator) {
  const signature = await pane.evaluate((element) => {
    const values: string[] = [];
    for (const span of element.querySelectorAll("[data-token-segment]")) {
      const node = span.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) continue;
      for (let index = 0; index < (node.textContent?.length ?? 0); index++) {
        const range = document.createRange();
        range.setStart(node, index);
        range.setEnd(node, index + 1);
        const rect = range.getBoundingClientRect();
        values.push(
          `${node.textContent![index]}:${rect.x}:${rect.y}:${rect.width}:${
            rect.height
          }`
        );
      }
    }
    return values.join(";");
  });
  return sha256(signature);
}

async function markerGeometry(pane: Locator) {
  return pane.evaluate((element) => {
    const expected: { kind: string; rectangle: DOMRect }[] = [];
    const range = document.createRange();
    for (const span of element.querySelectorAll("[data-token-segment]")) {
      const node = span.firstChild;
      if (!node || node.nodeType !== Node.TEXT_NODE) continue;
      for (const match of (node.textContent ?? "").matchAll(/[ \t]/g)) {
        range.setStart(node, match.index);
        range.setEnd(node, match.index + 1);
        expected.push({
          kind: match[0] === " " ? "space" : "tab",
          rectangle: range.getBoundingClientRect(),
        });
      }
    }
    const actual = Array.from(
      element.querySelectorAll<HTMLElement>(
        '[data-whitespace-kind="space"], [data-whitespace-kind="tab"]'
      )
    );
    let largestError = 0;
    let mismatchedKinds = 0;
    expected.forEach(({ kind, rectangle }, index) => {
      const marker = actual[index];
      if (!marker) return;
      if (marker.dataset.whitespaceKind !== kind) mismatchedKinds++;
      const painted = marker.getBoundingClientRect();
      largestError = Math.max(
        largestError,
        Math.abs(painted.x - rectangle.x),
        Math.abs(painted.y - rectangle.y),
        Math.abs(painted.width - rectangle.width),
        Math.abs(painted.height - rectangle.height)
      );
    });
    return {
      expectedCount: expected.length,
      markerCount: actual.length,
      tabCount: actual.filter(
        (marker) => marker.dataset.whitespaceKind === "tab"
      ).length,
      mismatchedKinds,
      largestError,
    };
  });
}

test("relayouts virtual rows on resize and paints whitespace without moving text", async ({
  page,
}) => {
  const text =
    `A B    C\tD\nE  F ${"wrapped words ".repeat(10)}e\u0301 👩‍💻\n`.repeat(250) +
    "complete resized tail 世界 👩‍💻";
  const expectedTokens = referenceTokens(text);
  await page.goto("/?model=o200k_base");
  await setLargeInput(page, text);
  await virtualResult(page, text.length, expectedTokens.length);
  const pane = textPane(page);
  const originalWidth = Number(await pane.getAttribute("data-layout-width"));
  const originalLineCount = Number(await pane.getAttribute("data-line-count"));
  await page.setViewportSize({ width: 800, height: 960 });
  await expect
    .poll(async () => Number(await pane.getAttribute("data-layout-width")))
    .toBeLessThan(originalWidth);
  await expect(pane).toHaveAttribute("aria-busy", "false");
  expect(Number(await pane.getAttribute("data-line-count"))).toBeGreaterThan(
    originalLineCount
  );
  await boundedDom(page);

  await pane.evaluate((element) => {
    element.scrollTop = element.scrollHeight / 2;
  });
  await expect
    .poll(async () =>
      Number(
        await pane
          .locator("[data-text-line]")
          .first()
          .getAttribute("data-text-line")
      )
    )
    .toBeGreaterThan(0);
  const before = await visibleGeometry(pane);
  await page
    .getByRole("checkbox", { name: "Show whitespace", exact: true })
    .check();
  await expect
    .poll(() => pane.locator("[data-whitespace-kind]").count())
    .toBeGreaterThan(0);
  expect(await visibleGeometry(pane)).toBe(before);
  const markers = await markerGeometry(pane);
  expect(markers.expectedCount).toBeGreaterThan(0);
  expect(markers.tabCount).toBeGreaterThan(0);
  expect(markers.markerCount).toBe(markers.expectedCount);
  expect(markers.mismatchedKinds).toBe(0);
  expect(markers.largestError).toBeLessThan(0.75);
  expect(markers.markerCount).toBeLessThan(1000);
  const hoveredSourceStart = await pane.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return Array.from(
      element.querySelectorAll<HTMLElement>("[data-token-segment]")
    ).find((span) => {
      const rectangle = span.getBoundingClientRect();
      return (
        rectangle.top > bounds.top + 16 && rectangle.bottom < bounds.bottom - 16
      );
    })?.dataset.sourceStart;
  });
  expect(hoveredSourceStart).toBeDefined();
  await pane.locator(`[data-source-start="${hoveredSourceStart}"]`).hover();
  expect(await visibleGeometry(pane)).toBe(before);
  await page
    .getByRole("checkbox", { name: "Show whitespace", exact: true })
    .uncheck();
  expect(await visibleGeometry(pane)).toBe(before);

  await pane.focus();
  await pane.press("End");
  await expect(pane.locator("[data-text-line]").last()).toHaveAttribute(
    "data-source-end",
    String(text.length)
  );
  await expect(pane).toContainText("complete resized tail 世界 👩‍💻");
  await expect(pane).toHaveAttribute(
    "data-token-count",
    String(expectedTokens.length)
  );
  await boundedDom(page);
});

test("native keyboard editing still updates the controlled input and token result", async ({
  page,
}) => {
  await page.goto("/?model=o200k_base");
  const text = "Native editing 世界 👩‍💻";
  await input(page).focus();
  await page.keyboard.insertText(text);
  await expect(input(page)).toHaveValue(text);
  await expect(textPane(page)).toHaveText(text);
  await expect(textPane(page)).toHaveAttribute(
    "data-token-count",
    String(referenceTokens(text).length)
  );
  await page.keyboard.insertText("\nsecond line");
  const edited = text + "\nsecond line";
  await expect(input(page)).toHaveValue(edited);
  await expect(textPane(page)).toHaveText(edited);
  await expect(textPane(page)).toHaveAttribute(
    "data-token-count",
    String(referenceTokens(edited).length)
  );
  await expect(textPane(page)).toHaveAttribute("aria-busy", "false");
});

test("edits a complete million-character document at its end and preserves Undo and Redo", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const pattern = "line text 世界 👩‍💻\tA B    C e\u0301\n";
  const tail = "complete editor tail 世界 👩‍💻";
  const prefixLength = 1_000_000 - tail.length;
  const prefix = pattern.repeat(Math.floor(prefixLength / pattern.length));
  const text = prefix + " ".repeat(prefixLength - prefix.length) + tail;
  const suffix = " [native edit 世界 👩‍💻]";
  const edited = text + suffix;
  const originalTokens = referenceTokens(text);
  const editedTokens = referenceTokens(edited);
  expect(text.length).toBe(1_000_000);
  await page.goto("/?model=o200k_base");
  await setLargeInput(page, text);
  await virtualResult(page, text.length, originalTokens.length);
  expect(await page.locator(".cm-content .cm-line").count()).toBeLessThan(200);
  expect(await page.locator("*").count()).toBeLessThan(5000);

  await input(page).focus();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText(suffix);
  await virtualResult(page, edited.length, editedTokens.length);
  await boundedDom(page);
  await input(page).focus();
  await page.keyboard.press("Control+z");
  await virtualResult(page, text.length, originalTokens.length);
  await input(page).focus();
  await page.keyboard.press("Control+y");
  await virtualResult(page, edited.length, editedTokens.length);
  await input(page).focus();
  await page.keyboard.press("Control+z");
  await virtualResult(page, text.length, originalTokens.length);
  await page.keyboard.press("Control+Shift+Z");
  await virtualResult(page, edited.length, editedTokens.length);
  await boundedDom(page);
});
