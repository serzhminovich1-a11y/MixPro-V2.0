import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import Anthropic from "@anthropic-ai/sdk";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const RANKS: Record<string, number> = { super_admin: 3, admin: 2, moderator: 1, user: 0 };

const MODE_PROMPTS: Record<string, string> = {
  cleanup:
    "Приведи текст в порядок: исправь орфографию, пунктуацию и формулировки, не меняя смысл. " +
    "Расставь базовое HTML-форматирование там, где это реально помогает читаемости — <b> для ключевых терминов и цифр, " +
    "<ul>/<li> для перечислений, <p> для абзацев. Не выдумывай новую информацию.",
  expand:
    "Это черновик термина для глоссария звукорежиссёров. Разверни его в полноценное определение: 3–6 предложений, " +
    "по делу, с конкретикой (диапазоны частот, типичные значения, короткий пример использования — если уместно для этого термина). " +
    "Форматируй как HTML: <p> абзацы, <b> ключевые слова/цифры, <ul>/<li> при необходимости.",
};

const SYSTEM_PROMPT =
  "Ты помогаешь редактировать статьи глоссария для MixPro — обучающей платформы для звукорежиссёров. " +
  "Пиши по-русски, точно и по делу, без вступлений и заключений. " +
  "Отвечай ТОЛЬКО итоговым HTML-фрагментом для вставки в текст статьи — без markdown, без пояснений от себя, " +
  "без ```-оград. Разрешённые теги: p, b, i, u, strong, em, ul, ol, li, blockquote, h2, h3, a, code. " +
  "Не используй img, script, style, iframe, table.";

/** Edit/expand/format glossary term text with Claude Haiku. Admin+ only —
 * mirrors the RoleGate on the glossary editor page itself; never trust
 * client-side gating alone for something that spends real API budget. */
export const aiEditText = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { mode: "cleanup" | "expand" | "chat"; html: string; instruction?: string }) =>
    z.object({
      mode: z.enum(["cleanup", "expand", "chat"]),
      html: z.string().max(20000),
      instruction: z.string().max(500).optional(),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: myRoles } = await context.supabase.from("user_roles").select("role").eq("user_id", context.userId);
    const myRank = (myRoles ?? []).reduce((m, r) => Math.max(m, RANKS[r.role] ?? 0), 0);
    if (myRank < 2) throw new Error("Только для админов");

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Missing ANTHROPIC_API_KEY environment variable");

    const instruction =
      data.mode === "chat"
        ? (data.instruction?.trim() || "Улучши этот текст.")
        : MODE_PROMPTS[data.mode];

    const userText = data.html.trim()
      ? `Задача: ${instruction}\n\nТекст (HTML):\n${data.html}`
      : `Задача: ${instruction}\n\n(Текста пока нет — напиши с нуля.)`;

    const client = new Anthropic({ apiKey });
    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userText }],
    });

    let html = msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();
    // The system prompt explicitly says no markdown/code fences, but models
    // wrap output in ```html ... ``` often enough anyway that this can't be
    // left to the prompt alone — strip it defensively if present.
    html = html.replace(/^```(?:html)?\s*\n?/i, "").replace(/\n?```\s*$/, "").trim();
    if (!html) throw new Error("Пустой ответ от ИИ");
    return { html };
  });
