import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import type { AssetManifest } from "../src/models/family-loader";
import { get_encoding } from "tiktoken";
const manifest = JSON.parse(
  readFileSync(
    new URL("../src/models/tokenizer-assets.json", import.meta.url),
    "utf8"
  )
) as AssetManifest;

const input = (page: Page) =>
  page.getByRole("textbox", { name: "Input text", exact: true });
const tokens = (page: Page) =>
  page.getByLabel("Tokenized text", { exact: true });
async function enterText(page: Page, text: string) {
  if (text.length <= 16_000) {
    await input(page).fill(text);
    return;
  }
  // Large-result regressions exercise React and rendering, without CDP's
  // pathological Input.insertText cost for large multiline textarea values.
  await input(page).evaluate((element, value) => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )!.set!;
    setter.call(element, value);
    element.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }, text);
  if (text.length > 32 * 1024) {
    await expect(input(page)).toHaveAttribute("data-editor-kind", "codemirror");
    await expect(input(page)).toHaveAttribute("data-editor-ready", "true");
  }
}
async function readyResult(page: Page, text: string, model?: string) {
  await expect(tokens(page)).toHaveAttribute(
    "data-source-length",
    String(text.length)
  );
  if (model)
    await expect(tokens(page)).toHaveAttribute("data-result-model", model);
  await expect(tokens(page)).toHaveAttribute("aria-busy", "false");
  if ((await tokens(page).getAttribute("data-virtualized")) === "false")
    await expect(tokens(page)).toHaveText(text);
}
async function choose(page: Page, name: string, label = name) {
  await page
    .getByRole("combobox", { name: "Choose model or encoding" })
    .click();
  await page.getByPlaceholder("Search model or encoding...").fill(name);
  await page.getByRole("option", { name: label, exact: true }).click();
}

test("model selection never collapses existing long results between equivalent models", async ({
  page,
}) => {
  const text = "hello ".repeat(8000);
  await page.goto("/?model=gpt-5.1");
  await enterText(page, text);
  await readyResult(page, text, "gpt-5.1");
  await expect(tokens(page)).toHaveAttribute("data-virtualized", "true");
  const recorder = await page.evaluateHandle(() => {
    const frames: {
      height: number;
      length: number;
      documentHeight: number;
      clientWidth: number;
      scrollY: number;
    }[] = [];
    let recording = true;
    function sample() {
      const element = document.querySelector('[aria-label="Tokenized text"]')!;
      frames.push({
        height: element.getBoundingClientRect().height,
        length: Number(element.getAttribute("data-source-length")),
        documentHeight: document.documentElement.scrollHeight,
        clientWidth: document.documentElement.clientWidth,
        scrollY: window.scrollY,
      });
      if (recording) requestAnimationFrame(sample);
    }
    sample();
    return {
      stop() {
        recording = false;
        return frames;
      },
    };
  });
  await choose(page, "gpt-5.2");
  await readyResult(page, text, "gpt-5.2");
  const frames = await recorder.evaluate((value) => value.stop());
  expect(frames.length).toBeGreaterThan(2);
  for (const frame of frames) expect(frame).toEqual(frames[0]);
  await recorder.dispose();
});

test("keeps results visible while a new family is downloading", async ({
  page,
  context,
}) => {
  const text = "previous results remain visible ".repeat(1500);
  let release: () => void = () => {};
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  let seen: () => void = () => {};
  const downloadStarted = new Promise<void>((resolve) => {
    seen = resolve;
  });
  await context.route("**/*qwen_bg.wasm", async (route) => {
    seen();
    await hold;
    await route.continue();
  });
  await page.goto("/?model=gpt-5.1");
  await enterText(page, text);
  await readyResult(page, text, "gpt-5.1");
  const visibleText = await tokens(page).textContent();
  const before = await tokens(page).boundingBox();
  await choose(page, "qwen3");
  await downloadStarted;
  await expect(tokens(page)).toHaveAttribute(
    "data-source-length",
    String(text.length)
  );
  expect(await tokens(page).textContent()).toBe(visibleText);
  expect(await tokens(page).boundingBox()).toEqual(before);
  await expect(page.locator(".animate-spin")).toHaveCount(1);
  release();
  await readyResult(page, text, "qwen3");
});

test("loads only the selected family, preserves text, and reuses cached instances", async ({
  page,
}) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => {
    if (request.url().endsWith(".wasm"))
      requests.push(new URL(request.url()).pathname);
  });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/?model=qwen3");
  await input(page).fill("Hello 世界 👩‍👧‍👦");
  await readyResult(page, "Hello 世界 👩‍👧‍👦", "qwen3");
  expect(requests).toEqual([manifest.families.qwen.wasmUrl]);
  await choose(page, "deepseek-r1");
  await readyResult(page, "Hello 世界 👩‍👧‍👦", "deepseek-r1");
  expect(requests).toEqual([
    manifest.families.qwen.wasmUrl,
    manifest.families.deepseek.wasmUrl,
  ]);
  await choose(page, "qwen3");
  await readyResult(page, "Hello 世界 👩‍👧‍👦", "qwen3");
  expect(requests).toHaveLength(2);
  await choose(page, "gpt-4o");
  await readyResult(page, "Hello 世界 👩‍👧‍👦", "gpt-4o");
  await choose(page, "claude", "Claude 3 / 4 (offline estimate) Estimate");
  await expect(
    page.getByText("Estimated token count", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText(/Claude’s current tokenizer is not public/)
  ).toBeVisible();
  await readyResult(page, "Hello 世界 👩‍👧‍👦", "claude");
  expect(requests).toEqual([
    manifest.families.qwen.wasmUrl,
    manifest.families.deepseek.wasmUrl,
    manifest.families["openai-claude"].wasmUrl,
  ]);
  await expect(input(page)).toHaveValue("Hello 世界 👩‍👧‍👦");
  expect(errors).toEqual([]);
});

test("recovers from a vocabulary download failure", async ({ page }) => {
  let failures = 0;
  await page.route("**/*qwen_bg.wasm", async (route) => {
    if (failures++ === 0)
      await route.fulfill({ status: 503, body: "Temporary error" });
    else await route.continue();
  });
  await page.goto("/?model=qwen3");
  await expect(page.getByRole("alert")).toContainText("503");
  await input(page).fill("Retry works");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await readyResult(page, "Retry works", "qwen3");
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test("retries a failed JavaScript module import with a new URL", async ({
  page,
  context,
}) => {
  let failures = 0;
  await context.route("**/qwen.js*", async (route) => {
    if (failures++ === 0)
      await route.fulfill({ status: 503, body: "Temporary error" });
    else await route.continue();
  });
  await page.goto("/?model=qwen3");
  await expect(page.getByRole("alert")).toBeVisible();
  await input(page).fill("Module retry works");
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await readyResult(page, "Module retry works", "qwen3");
  expect(failures).toBe(2);
});

test("handles rapid edits and normalizes Claude legacy input", async ({
  page,
}) => {
  await page.goto("/?model=claude-legacy");
  await input(page).fill("ＡＢＣ ﬁ e\u0301 👩‍💻");
  await readyResult(page, "ABC fi é 👩‍💻", "claude-legacy");
  await expect(
    page.getByText(/Unicode normalized for this vocabulary\./)
  ).toBeVisible();
  await choose(page, "gpt-4o");
  await input(page).fill("old text".repeat(1500));
  await input(page).fill("latest text 世界");
  await readyResult(page, "latest text 世界", "gpt-4o");
  await expect(input(page)).toHaveValue("latest text 世界");
});

test("virtualizes large results without truncating text or token IDs", async ({
  page,
}) => {
  const text = "hello ".repeat(20_000) + "untruncated tail 世界 👩‍💻";
  const reference = get_encoding("o200k_base");
  const expectedTokens = [...reference.encode(text)];
  const expectedCount = expectedTokens.length;
  reference.free();
  await page.goto("/?model=o200k_base");
  await enterText(page, text);
  await expect(
    page.getByText(String(expectedCount), { exact: true })
  ).toBeVisible();
  await readyResult(page, text, "o200k_base");
  await expect(tokens(page)).toHaveAttribute("data-virtualized", "true");
  const ids = page.getByLabel("Token IDs", { exact: true });
  await expect(ids).toHaveAttribute("data-token-count", String(expectedCount));
  expect(
    await tokens(page).locator("[data-token-segment]").count()
  ).toBeLessThan(2000);
  await tokens(page).focus();
  await tokens(page).press("End");
  await expect(tokens(page).locator("[data-text-line]").last()).toHaveAttribute(
    "data-source-end",
    String(text.length)
  );
  await expect(tokens(page)).toContainText("untruncated tail 世界 👩‍💻");
  await ids.focus();
  await ids.press("End");
  const finalRow = ids.locator("[data-id-line]").last();
  await expect(finalRow).toHaveAttribute(
    "data-token-end",
    String(expectedCount)
  );
  const start = Number(await finalRow.getAttribute("data-token-start"));
  const displayedIds = (await finalRow.textContent())
    ?.split(",")
    .filter((value) => value.trim() !== "")
    .map((value) => Number(value.trim()));
  expect(displayedIds).toEqual(expectedTokens.slice(start));
  await expect(page.getByText(/Showing the first/)).toHaveCount(0);
});

test("virtualizes a ten-thousand-character result before mounting every token", async ({
  page,
}) => {
  const text = "hello ".repeat(Math.ceil(10_000 / 6)).slice(0, 10_000);
  await page.goto("/?model=o200k_base");
  await enterText(page, text);
  await readyResult(page, text, "o200k_base");
  await expect(tokens(page)).toHaveAttribute("data-virtualized", "true");
  await expect(page.getByLabel("Token IDs", { exact: true })).toHaveAttribute(
    "data-virtualized",
    "true"
  );
  expect(await tokens(page).locator("[data-text-line]").count()).toBeLessThan(
    50
  );
  expect(
    await page
      .getByLabel("Token IDs", { exact: true })
      .locator("[data-id-line]")
      .count()
  ).toBeLessThan(50);
});

test("keeps both columns fixed while the input grows", async ({ page }) => {
  await page.goto("/?model=o200k_base");
  const text = "hello ".repeat(2_000);
  await enterText(page, "short");
  await readyResult(page, "short", "o200k_base");
  const panes = page.locator(
    '[aria-label="Input text"], [aria-label="Tokenized text"], [aria-label="Token IDs"]'
  );
  const before = await panes.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })
  );
  await enterText(page, text);
  await readyResult(page, text, "o200k_base");
  const after = await panes.evaluateAll((elements) =>
    elements.map((element) => {
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })
  );
  expect(after).toEqual(before);
});

test("defaults to GPT-5.6 Sol and keeps the layout stable while calculating", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("combobox", { name: "Choose model or encoding" })
  ).toContainText("gpt-5.6-sol");
  await input(page).fill("Hello world");
  await readyResult(page, "Hello world", "gpt-5.6-sol");
  const countCard = page
    .getByText("Token count", { exact: true })
    .locator("..");
  const cardBefore = await countCard.boundingBox();
  const textBefore = await tokens(page).boundingBox();
  const modelBefore = await page
    .getByRole("combobox", { name: "Choose model or encoding" })
    .locator("span.truncate")
    .boundingBox();
  await input(page).fill("Hello world!");
  await expect(tokens(page)).toHaveAttribute("aria-busy", "true");
  await expect(page.getByRole("status")).toHaveCount(0);
  await expect(page.locator(".animate-spin")).toHaveCount(0);
  expect(await countCard.boundingBox()).toEqual(cardBefore);
  expect((await tokens(page).boundingBox())?.y).toBe(textBefore?.y);
  await expect(page.locator(".animate-spin")).toHaveCount(0);
  expect(
    await page
      .getByRole("combobox", { name: "Choose model or encoding" })
      .locator("span.truncate")
      .boundingBox()
  ).toEqual(modelBefore);
  await readyResult(page, "Hello world!", "gpt-5.6-sol");
  expect(await countCard.boundingBox()).toEqual(cardBefore);
  expect((await tokens(page).boundingBox())?.y).toBe(textBefore?.y);
});

test("showing whitespace preserves character widths and tab stops", async ({
  page,
}) => {
  const text = "A B    C\tD\nE  F";
  await page.goto("/");
  await input(page).fill(text);
  await readyResult(page, text, "gpt-5.6-sol");
  const positions = () =>
    tokens(page).evaluate((element) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const result: {
        character: string;
        x: number;
        y: number;
        width: number;
        height: number;
      }[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const content = node.textContent ?? "";
        for (let index = 0; index < content.length; index++) {
          const range = document.createRange();
          range.setStart(node, index);
          range.setEnd(node, index + 1);
          const { x, y, width, height } = range.getBoundingClientRect();
          result.push({ character: content[index]!, x, y, width, height });
        }
      }
      return result;
    });
  const before = await positions();
  await page
    .getByRole("checkbox", { name: "Show whitespace", exact: true })
    .check();
  expect(await positions()).toEqual(before);
  await expect(tokens(page)).toHaveText(text);
  await page
    .getByRole("checkbox", { name: "Show whitespace", exact: true })
    .uncheck();
  expect(await positions()).toEqual(before);
  await tokens(page)
    .locator("[data-token-segment]")
    .filter({ hasText: " B" })
    .first()
    .hover();
  expect(await positions()).toEqual(before);
});

test("select all stays inside the focused result pane", async ({ page }) => {
  const text = "Hello world";
  await page.goto("/");
  await input(page).fill(text);
  await readyResult(page, text, "gpt-5.6-sol");

  for (const label of ["Tokenized text", "Token IDs"]) {
    const pane = page.getByLabel(label, { exact: true });
    await pane.click();
    await pane.press("Control+A");
    const selection = await page.evaluate(() => {
      const current = window.getSelection();
      const paneFor = (node: Node | null) => {
        const element =
          node instanceof Element ? node : node?.parentElement ?? null;
        return element
          ?.closest<HTMLElement>("[aria-label]")
          ?.getAttribute("aria-label");
      };
      return {
        text: current?.toString() ?? "",
        anchorPane: paneFor(current?.anchorNode ?? null),
        focusPane: paneFor(current?.focusNode ?? null),
      };
    });
    expect(selection.text.length).toBeGreaterThan(0);
    expect(selection.anchorPane).toBe(label);
    expect(selection.focusPane).toBe(label);
  }
});

test("opens the bundled tokenizer license page", async ({ page }) => {
  await page.goto("/");
  const licensePage = page;
  await Promise.all([
    page.waitForURL(/\/licenses\/index\.html$/),
    page.getByRole("link", { name: "Tokenizer licenses" }).click(),
  ]);
  await expect(licensePage).toHaveTitle("Tokenizer licenses — Tiktokenizer");
  await expect(
    licensePage.getByRole("heading", { name: "Tokenizer licenses" })
  ).toBeVisible();
  await licensePage.getByRole("link", { name: /Tiktokenizer/ }).click();
  await expect(licensePage).toHaveURL(/\/$/);
});
