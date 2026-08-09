import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const pushInputSchema = z.object({
  title: z.string().max(200).optional().default("Untitled build"),
  html: z.string().min(1).max(200_000),
  history: z.array(messageSchema).max(40).optional().default([]),
});

export const pushToLovable = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => pushInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: row, error } = await supabase
      .from("lovable_pushes")
      .insert({ title: data.title, html: data.html, prompt_history: data.history })
      .select("id")
      .single();

    if (error) throw new Error(`Could not queue push: ${error.message}`);
    return { id: row.id };
  });

const statusInputSchema = z.object({ id: z.string().uuid() });

export const getLovablePushStatus = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => statusInputSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: row, error } = await supabase
      .from("lovable_pushes")
      .select("status, project_url, editor_url, error")
      .eq("id", data.id)
      .single();

    if (error) throw new Error(`Could not check push status: ${error.message}`);
    return row;
  });
