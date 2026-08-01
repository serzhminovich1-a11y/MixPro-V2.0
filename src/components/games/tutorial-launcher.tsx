import { HelpCircle } from "lucide-react";
import { HowToPlay, useTutorial } from "./how-to-play";
import { TUTORIALS } from "@/lib/games/tutorials";

/** Drop-in tutorial for game routes that don't use <GameFrame>.
 *  Renders auto-shown tutorial + a small floating "?" trigger. */
export function TutorialLauncher({ gameId }: { gameId: string }) {
  const { open, setOpen } = useTutorial(TUTORIALS[gameId] ? gameId : undefined);
  if (!TUTORIALS[gameId]) return null;
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-[60] inline-flex items-center gap-1.5 rounded-full border border-mint/40 bg-background/80 px-3 py-2 font-mono text-[10px] uppercase tracking-widest text-mint shadow-lg backdrop-blur transition-colors hover:bg-mint/10"
        aria-label="Как играть"
      >
        <HelpCircle className="h-3.5 w-3.5" /> Как играть
      </button>
      <HowToPlay gameId={gameId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
