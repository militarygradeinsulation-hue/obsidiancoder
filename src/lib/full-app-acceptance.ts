import type { FullAppBlueprint } from "./full-app-blueprint";

type Journey = FullAppBlueprint["acceptanceJourneys"][number];

function js(value: unknown): string {
  return JSON.stringify(value);
}

function stepCode(step: Journey["steps"][number], index: number): string {
  const label = "step " + String(index + 1);
  switch (step.action) {
    case "goto": {
      const logical = step.path === "/" ? "" : step.path.replace(/^\//, "");
      const target = logical ? "./#/" + logical : "./#/";
      return `    await page.goto(${js(target)}, { waitUntil: "networkidle" });`;
    }
    case "click":
      return `    await page.getByTestId(${js(step.testId)}).click();`;
    case "fill": {
      let value = js(step.value);
      if (step.valueFrom === "e2e_email") value = "e2eEmail";
      if (step.valueFrom === "e2e_password") value = "e2ePassword";
      if (step.valueFrom === "unique") {
        value = `(${js(step.value)} + "-" + uniqueSuffix)`;
      }
      return [
        `    // ${label}${step.note ? ": " + step.note.replace(/\n/g, " ") : ""}`,
        `    await page.getByTestId(${js(step.testId)}).fill(${value});`,
      ].join("\n");
    }
    case "expect_visible":
      return `    await expect(page.getByTestId(${js(step.testId)})).toBeVisible();`;
    case "expect_text":
      return `    await expect(page.getByTestId(${js(step.testId)})).toContainText(${js(step.text)});`;
    case "select":
      return `    await page.getByTestId(${js(step.testId)}).selectOption(${js(step.value)});`;
    case "check":
      return step.checked
        ? `    await page.getByTestId(${js(step.testId)}).check();`
        : `    await page.getByTestId(${js(step.testId)}).uncheck();`;
    case "press":
      return `    await page.getByTestId(${js(step.testId)}).press(${js(step.key)});`;
    case "expect_url": {
      const logical = step.path === "/" ? "" : step.path.replace(/^\//, "");
      const hash = logical ? "#/" + logical : "#/";
      return `    expect(new URL(page.url()).hash).toBe(${js(hash)});`;
    }
    case "expect_value":
      return `    await expect(page.getByTestId(${js(step.testId)})).toHaveValue(${js(step.value)});`;
    case "upload_fixture": {
      const fixture =
        step.kind === "png"
          ? `{ name: "obsidian-qa.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZQmcAAAAASUVORK5CYII=", "base64") }`
          : step.kind === "pdf"
            ? `{ name: "obsidian-qa.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\\n1 0 obj<</Type/Catalog>>endobj\\ntrailer<</Root 1 0 R>>\\n%%EOF") }`
            : `{ name: "obsidian-qa.txt", mimeType: "text/plain", buffer: Buffer.from("Obsidian functional QA fixture") }`;
      return `    await page.getByTestId(${js(step.testId)}).setInputFiles(${fixture});`;
    }
  }
}

export function acceptancePlanFile(blueprint: FullAppBlueprint): string {
  return JSON.stringify({
    version: 1,
    generatedBy: "Aetheris Obsidian",
    app: blueprint.name,
    journeys: blueprint.acceptanceJourneys,
  }, null, 2) + "\n";
}

export function acceptanceSpecFile(blueprint: FullAppBlueprint): string {
  const journeys = blueprint.acceptanceJourneys;
  if (!journeys.length) {
    return `import { test } from "@playwright/test";\n\ntest.skip("No structured acceptance journeys in this blueprint", () => {});\n`;
  }

  const blocks = journeys.map(journey => {
    const body = journey.steps.map(stepCode).join("\n");
    return `
test(${js(journey.name)}, async ({ page }) => {
  const e2eEmail = process.env.OBSIDIAN_E2E_EMAIL || "";
  const e2ePassword = process.env.OBSIDIAN_E2E_PASSWORD || "";
  const requireAuth = process.env.OBSIDIAN_REQUIRE_AUTH_E2E === "true";
  const uniqueSuffix = Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);

  if (${journey.authRequired ? "true" : "false"} && (!e2eEmail || !e2ePassword)) {
    if (requireAuth) {
      throw new Error("Authenticated acceptance journey requires OBSIDIAN_E2E_EMAIL and OBSIDIAN_E2E_PASSWORD.");
    }
    test.skip(true, "Authenticated journey skipped because E2E test credentials are not configured.");
  }

  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));

${body}

  expect(pageErrors, "Acceptance journey should not produce uncaught browser errors.").toEqual([]);
});`;
  }).join("\n");

  return `import { test, expect } from "@playwright/test";\n${blocks}\n`;
}

export function addAcceptanceFiles(
  files: Record<string, string>,
  blueprint: FullAppBlueprint,
): Record<string, string> {
  return {
    ...files,
    "obsidian/acceptance.json": acceptancePlanFile(blueprint),
    "tests/obsidian.acceptance.spec.ts": acceptanceSpecFile(blueprint),
  };
}
