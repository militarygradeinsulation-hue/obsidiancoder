/**
 * MCP tool: classify_prompt
 * Dry-run the task classifier on a prompt — returns the predicted
 * execution path, strategy, model tier, and confidence without
 * spending any credits. Useful for building on top of Obsidian.
 */
import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { classifyTask } from "../../task-classifier";
import { planFor } from "../../orchestrator";

export default defineTool({
  name: "classify_prompt",
  title: "Classify prompt",
  description:
    "Preview how Obsidian would route a given prompt — task type, strategy " +
    "(deterministic patch / ai-patch / full-generation / advisory), model tier, " +
    "and confidence — without consuming any credits.",
  inputSchema: {
    prompt: z.string().min(1).max(4000).describe("The prompt to classify."),
    has_html: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether an existing HTML document is present (affects routing)."),
    mode: z
      .enum(["agent", "chat", "plan"])
      .optional()
      .default("agent")
      .describe("Editing mode."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ prompt, has_html, mode }) => {
    const classification = classifyTask(prompt, { mode: mode ?? "agent", hasHtml: has_html ?? false });
    const plan = planFor({
      prompt,
      hasHtml: has_html ?? false,
      mode: mode ?? "agent",
      pickerModel: undefined,
      hasAttachments: false,
    });

    const result = {
      taskType: classification.taskType,
      strategy: classification.strategy,
      executionPath: classification.executionPath,
      confidence: classification.confidence,
      reason: classification.reason,
      suggestedModel: plan.model,
      suggestedTier: plan.tier,
      planReason: plan.reason,
      useDeterministic: plan.useDeterministic,
      usePatch: plan.usePatch,
      useFullGeneration: plan.useFullGeneration,
      advisory: plan.advisory,
    };

    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      structuredContent: result,
    };
  },
});
