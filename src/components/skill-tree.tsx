import { useMemo, useRef, useState } from "react";
import { Lock, Check, Play } from "lucide-react";

export type SkillCourse = {
  id: string;
  slug: string;
  title: string;
  level: "beginner" | "intermediate" | "pro";
  prerequisite_id: string | null;
  position_x: number;
  position_y: number;
  lesson_count: number;
};

export type SkillProgress = { course_id: string; completed_lessons: number; total_lessons: number; completed_at: string | null };

type Props = {
  courses: SkillCourse[];
  progress: SkillProgress[];
  onOpen: (slug: string) => void;
  editable?: boolean;
  onSavePositions?: (positions: Array<{ id: string; x: number; y: number }>) => void;
};

const LEVEL_COLORS: Record<SkillCourse["level"], { fill: string; ring: string; label: string }> = {
  beginner: { fill: "#3fd39a", ring: "rgba(63,211,154,0.4)", label: "Новичок" },
  intermediate: { fill: "#4dd0e1", ring: "rgba(77,208,225,0.4)", label: "Средний" },
  pro: { fill: "#c084fc", ring: "rgba(192,132,252,0.4)", label: "Про" },
};

const NODE_W = 200;
const NODE_H = 90;

export function SkillTree({ courses, progress, onOpen, editable = false, onSavePositions }: Props) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>(() => {
    const map: Record<string, { x: number; y: number }> = {};
    courses.forEach((c, i) => {
      map[c.id] = { x: c.position_x || 60 + (i % 4) * 240, y: c.position_y || 60 + Math.floor(i / 4) * 140 };
    });
    return map;
  });
  const [dragging, setDragging] = useState<string | null>(null);
  const dragMovedRef = useRef(false);
  const [dirty, setDirty] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const progressById = useMemo(() => new Map(progress.map((p) => [p.course_id, p])), [progress]);
  const doneIds = useMemo(() => new Set(progress.filter((p) => p.completed_at).map((p) => p.course_id)), [progress]);

  function isUnlocked(c: SkillCourse) {
    if (!c.prerequisite_id) return true;
    return doneIds.has(c.prerequisite_id);
  }

  function handleMove(e: React.MouseEvent) {
    if (!dragging || !editable || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.round(e.clientX - rect.left - NODE_W / 2));
    const y = Math.max(0, Math.round(e.clientY - rect.top - NODE_H / 2));
    setPositions((p) => ({ ...p, [dragging]: { x, y } }));
    dragMovedRef.current = true;
    setDirty(true);
  }

  function save() {
    if (!onSavePositions) return;
    onSavePositions(courses.map((c) => ({ id: c.id, x: positions[c.id]?.x ?? c.position_x, y: positions[c.id]?.y ?? c.position_y })));
    setDirty(false);
  }

  const maxX = Math.max(600, ...Object.values(positions).map((p) => p.x + NODE_W + 60));
  const maxY = Math.max(400, ...Object.values(positions).map((p) => p.y + NODE_H + 60));

  return (
    <div className="relative overflow-auto rounded-2xl border border-black/40 bg-black/30">
      {editable && dirty && (
        <button
          onClick={save}
          className="absolute right-3 top-3 z-10 rounded-lg bg-mint px-3 py-1.5 text-xs font-semibold text-black shadow-lg"
        >
          Сохранить позиции
        </button>
      )}
      <svg
        ref={svgRef}
        width={maxX}
        height={maxY}
        onMouseMove={handleMove}
        onMouseUp={() => setDragging(null)}
        onMouseLeave={() => setDragging(null)}
        style={{ cursor: dragging ? "grabbing" : "default" }}
      >
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
          </pattern>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,255,255,0.35)" />
          </marker>
        </defs>
        <rect width={maxX} height={maxY} fill="url(#grid)" />

        {/* edges */}
        {courses.map((c) => {
          if (!c.prerequisite_id) return null;
          const from = positions[c.prerequisite_id];
          const to = positions[c.id];
          if (!from || !to) return null;
          const x1 = from.x + NODE_W / 2;
          const y1 = from.y + NODE_H;
          const x2 = to.x + NODE_W / 2;
          const y2 = to.y;
          const mid = (y1 + y2) / 2;
          const path = `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`;
          const unlocked = doneIds.has(c.prerequisite_id);
          return (
            <path
              key={`e-${c.id}`}
              d={path}
              fill="none"
              stroke={unlocked ? "rgba(63,211,154,0.5)" : "rgba(255,255,255,0.25)"}
              strokeWidth={2}
              strokeDasharray={unlocked ? "0" : "6 4"}
              markerEnd="url(#arrow)"
            />
          );
        })}

        {/* nodes */}
        {courses.map((c) => {
          const p = positions[c.id];
          if (!p) return null;
          const col = LEVEL_COLORS[c.level];
          const prog = progressById.get(c.id);
          const done = prog?.completed_at != null;
          const pct = prog && prog.total_lessons > 0 ? Math.round((prog.completed_lessons / prog.total_lessons) * 100) : 0;
          const unlocked = isUnlocked(c);
          const openCourse = () => onOpen(c.slug);
          return (
            <g
              key={c.id}
              transform={`translate(${p.x}, ${p.y})`}
              style={{ cursor: editable ? "grab" : "pointer" }}
              onMouseDown={(e) => {
                if (editable) {
                  e.preventDefault();
                  dragMovedRef.current = false;
                  setDragging(c.id);
                }
              }}
              onMouseUp={() => {
                if (editable && dragging === c.id && !dragMovedRef.current) {
                  openCourse();
                }
              }}
              onClick={() => !editable && openCourse()}
            >
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={12}
                fill={unlocked ? "rgba(10,10,12,0.9)" : "rgba(40,40,45,0.6)"}
                stroke={done ? col.fill : unlocked ? col.ring : "rgba(255,255,255,0.15)"}
                strokeWidth={done ? 2.5 : 1.5}
              />
              {/* Level accent bar */}
              <rect x={0} y={0} width={NODE_W} height={4} rx={2} fill={col.fill} opacity={unlocked ? 1 : 0.4} />

              <text x={14} y={30} fill={unlocked ? "#fff" : "rgba(255,255,255,0.5)"} fontSize={13} fontWeight={700}>
                {c.title.length > 22 ? c.title.slice(0, 22) + "…" : c.title}
              </text>
              <text x={14} y={48} fill="rgba(255,255,255,0.5)" fontSize={10} style={{ letterSpacing: 1, textTransform: "uppercase" }}>
                {col.label} · {c.lesson_count} уроков
              </text>

              <foreignObject x={14} y={NODE_H - 32} width={88} height={24}>
                <button
                  type="button"
                  onMouseDown={(e) => e.stopPropagation()}
                  onMouseUp={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    openCourse();
                  }}
                  style={{
                    height: 22,
                    padding: "0 9px",
                    borderRadius: 5,
                    border: `1px solid ${unlocked ? col.ring : "rgba(255,255,255,0.12)"}`,
                    background: unlocked ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
                    color: unlocked ? col.fill : "rgba(255,255,255,0.45)",
                    fontSize: 9,
                    fontWeight: 800,
                    letterSpacing: 0,
                    textTransform: "uppercase",
                    cursor: "pointer",
                  }}
                >
                  Открыть
                </button>
              </foreignObject>

              {/* status icon */}
              <g transform={`translate(${NODE_W - 34}, ${NODE_H / 2 - 12})`}>
                {done ? (
                  <>
                    <circle r={11} cx={12} cy={12} fill={col.fill} />
                    <foreignObject x={2} y={2} width={20} height={20}>
                      <div style={{ color: "#000", display: "flex", alignItems: "center", justifyContent: "center", height: 20 }}>
                        <Check size={14} />
                      </div>
                    </foreignObject>
                  </>
                ) : !unlocked ? (
                  <foreignObject x={0} y={0} width={24} height={24}>
                    <div style={{ color: "rgba(255,255,255,0.5)", display: "flex", alignItems: "center", justifyContent: "center", height: 24 }}>
                      <Lock size={16} />
                    </div>
                  </foreignObject>
                ) : (
                  <foreignObject x={0} y={0} width={24} height={24}>
                    <div style={{ color: col.fill, display: "flex", alignItems: "center", justifyContent: "center", height: 24 }}>
                      <Play size={16} />
                    </div>
                  </foreignObject>
                )}
              </g>

              {/* progress bar */}
              {unlocked && !done && prog && prog.total_lessons > 0 && (
                <>
                  <rect x={14} y={NODE_H - 16} width={NODE_W - 28} height={4} rx={2} fill="rgba(255,255,255,0.1)" />
                  <rect x={14} y={NODE_H - 16} width={(NODE_W - 28) * (pct / 100)} height={4} rx={2} fill={col.fill} />
                  <text x={NODE_W - 14} y={NODE_H - 20} textAnchor="end" fontSize={9} fill={col.fill}>
                    {pct}%
                  </text>
                </>
              )}
            </g>
          );
        })}
      </svg>
      <div className="border-t border-black/40 bg-black/40 px-4 py-2 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        <span className="mr-4"><span className="inline-block h-2 w-4 rounded" style={{ background: LEVEL_COLORS.beginner.fill }} /> новичок</span>
        <span className="mr-4"><span className="inline-block h-2 w-4 rounded" style={{ background: LEVEL_COLORS.intermediate.fill }} /> средний</span>
        <span><span className="inline-block h-2 w-4 rounded" style={{ background: LEVEL_COLORS.pro.fill }} /> про</span>
      </div>
    </div>
  );
}
