import { supabase } from "@/integrations/supabase/client";

/**
 * Save a game session score to `game_scores`.
 * @param gameType — matches game_scores.game_type; keep kebab-case (eq-cut, pan, etc)
 * @param score — final integer score (usually sum of accuracy over rounds)
 * @param accuracy — 0..100 average
 */
export async function saveGameScore(gameType: string, score: number, accuracy: number) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { saved: false as const, reason: "auth" as const };
  const { error } = await supabase.from("game_scores").insert({
    user_id: session.user.id,
    game_type: gameType,
    score: Math.round(score),
    accuracy: Number(accuracy.toFixed(2)),
  });
  if (error) return { saved: false as const, reason: "error" as const, message: error.message };
  return { saved: true as const };
}
