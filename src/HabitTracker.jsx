import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell,
} from "recharts";
import {
  Plus, Check, Flame, Settings as SettingsIcon, BarChart3, ListChecks,
  ChevronLeft, ChevronRight, Archive, ArchiveRestore, Trash2, Download,
  Moon, Sun, X, GripVertical, Sparkles, Pencil, Minus, CalendarDays, Zap, LayoutGrid, TrendingUp, TrendingDown,
  Play, Pause, StopCircle, Clock3, LogOut,
} from "lucide-react";
import {
  getConfig, saveConfig, fetchHabits, fetchEntries,
  insertHabit, updateHabitRow, deleteHabitCascade, upsertEntry,
  getProfile, saveProfile,
} from "./lib/db";

/* ---------------- date utils ---------------- */
const DAY = 86400000;
const pad = (n) => String(n).padStart(2, "0");
const fmt = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = (s) => { const [a, b, c] = s.split("-").map(Number); return new Date(a, b - 1, c); };
const todayStr = () => fmt(new Date());
const addDays = (s, n) => fmt(new Date(parse(s).getTime() + n * DAY));
const dow = (s) => parse(s).getDay(); // 0=Sun
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const prettyDate = (s) => { const d = parse(s); return `${DOW_SHORT[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; };
const weekStart = (s) => addDays(s, -dow(s)); // Sunday start

/* ---------------- motion language (one easing vocabulary, reused everywhere) ---------------- */
const EASE = "cubic-bezier(.22,1,.36,1)";        // fluid deceleration
const SPRING = "cubic-bezier(.34,1.56,.64,1)";   // playful overshoot

/* ---------------- theme ---------------- */
const ACCENTS = [
  { name: "Iris", hex: "#7B7BFF" },
  { name: "Fern", hex: "#3DDC97" },
  { name: "Ember", hex: "#FF7A59" },
  { name: "Marigold", hex: "#FFB454" },
  { name: "Orchid", hex: "#E86BB3" },
];
const AVATAR_EMOJIS = ["\u{1F642}", "\u{1F98A}", "\u{1F331}", "⚡", "\u{1F525}", "\u{1F30A}", "\u{1F9D8}", "\u{1F31F}", "\u{1F3AF}", "\u{1F984}"];
const CATEGORIES = [
  { name: "Health", color: "#3DDC97" },
  { name: "Mindfulness", color: "#9D8CFF" },
  { name: "Work", color: "#FFB454" },
  { name: "Creativity", color: "#FF7AA8" },
];
const catColor = (name) => (CATEGORIES.find((c) => c.name === name) || {}).color || "#8A8A96";

/* per-habit color palette for Quality (intensity) habits — vivid against the dark shell */
const HABIT_COLORS = ["#4ADE80", "#5B9CFF", "#B48CFF", "#FF6B7A", "#FFB454", "#3ED8C3", "#F472B6", "#E2E86B"];
const hColor = (h) => h.color || catColor(h.category);

const THEMES = {
  dark: {
    bg: "#0A0A0F", surface: "rgba(21,21,29,.86)", surface2: "rgba(32,32,44,.85)", solid: "#15151D",
    text: "#F4F4F8", muted: "#9C9CAC", faint: "#63636F", border: "rgba(255,255,255,.07)",
    shadow: "0 1px 0 rgba(255,255,255,.04) inset, 0 2px 6px rgba(0,0,0,.45), 0 18px 48px rgba(0,0,0,.42)",
    ringTrack: "#22222D", heat0: "rgba(255,255,255,.055)", nav: "rgba(14,14,20,.82)",
  },
  light: {
    bg: "#F6F6F3", surface: "rgba(255,255,255,.88)", surface2: "rgba(238,238,232,.9)", solid: "#FFFFFF",
    text: "#17171F", muted: "#6E6E7A", faint: "#9A9AA4", border: "rgba(20,20,30,.09)",
    shadow: "0 1px 2px rgba(20,20,30,.05), 0 10px 30px rgba(20,20,30,.08)",
    ringTrack: "#E8E8E1", heat0: "rgba(20,20,30,.07)", nav: "rgba(255,255,255,.85)",
  },
};

/* ---------------- intensity system (0–5 scale) ---------------- */
const MAX_LVL = 5;
const INTENSITY_LABELS = ["Not done", "Touched it", "Light", "Decent", "Strong", "Crushed it"];
const LVL_ALPHA = ["2E", "52", "78", "A4", "FF"]; // levels 1..5 → rising saturation/brightness of the habit color
function cellStyle(base, lvl, T) {
  if (lvl <= 0) return { background: T.heat0, boxShadow: "none" };
  return {
    background: base + LVL_ALPHA[Math.min(MAX_LVL, lvl) - 1],
    boxShadow: lvl >= MAX_LVL ? `0 0 7px 1px ${base}99` : lvl === MAX_LVL - 1 ? `0 0 4px ${base}55` : "none",
  };
}

/* ---------------- starter habits (optional one-click set for new accounts) ---------------- */
const STARTER_HABITS = [
  { name: "Meditate", emoji: "\u{1F9D8}", category: "Mindfulness", type: "daily", desc: "10 quiet minutes", mode: "simple", days: [], target: 3, quant: false, quantTarget: 1, unit: "", color: null },
  { name: "Read 20 pages", emoji: "\u{1F4DA}", category: "Creativity", type: "daily", desc: "", mode: "quality", color: "#B48CFF", days: [], target: 3, quant: false, quantTarget: 1, unit: "" },
  { name: "Strength training", emoji: "\u{1F3CB}\uFE0F", category: "Health", type: "days", days: [1, 3, 5], desc: "", mode: "simple", target: 3, quant: false, quantTarget: 1, unit: "", color: null },
  { name: "Drink water", emoji: "\u{1F4A7}", category: "Health", type: "daily", quant: true, quantTarget: 8, unit: "glasses", desc: "", mode: "simple", days: [], target: 3, color: null },
  { name: "Journal", emoji: "\u270D\uFE0F", category: "Mindfulness", type: "daily", desc: "", mode: "simple", days: [], target: 3, quant: false, quantTarget: 1, unit: "", color: null },
  { name: "Deep work block", emoji: "\u{1F3AF}", category: "Work", type: "days", days: [1, 2, 3, 4, 5], mode: "quality", color: "#4ADE80", desc: "90 min, no inbox", target: 3, quant: false, quantTarget: 1, unit: "" },
  { name: "Play guitar", emoji: "\u{1F3B8}", category: "Creativity", type: "tpw", target: 3, desc: "", mode: "simple", days: [], quant: false, quantTarget: 1, unit: "", color: null },
];

/* ---------------- Supabase row <-> app model mapping ---------------- */
const parseNotes = (n) => { if (!n) return {}; try { const o = JSON.parse(n); return o && typeof o === "object" ? o : {}; } catch { return {}; } };

const rowToHabit = (r, cfg = {}, i = 0) => ({
  id: r.id,
  name: r.name,
  emoji: r.icon || "\u2728",
  category: r.category || "Health",
  desc: cfg.desc || "",
  mode: cfg.mode || "simple",
  color: cfg.color || null,
  type: cfg.type || "daily",
  days: cfg.days || [],
  target: (cfg.type === "tpw" ? r.target : cfg.target) || 3,
  quant: !!cfg.quant,
  quantTarget: cfg.quantTarget || (cfg.quant ? r.target : 1) || 1,
  unit: cfg.unit || "",
  archived: !!cfg.archived,
  order: cfg.order != null ? cfg.order : i,
});

/* ---------------- habit logic (Quality habits extend, never replace, the Simple model) ---------------- */
const isQuality = (h) => h.mode === "quality";
const isScheduled = (h, d) => (h.type === "days" ? h.days.includes(dow(d)) : true);
const doneValue = (comps, d, id) => (comps[d] && comps[d][id]) || 0;
const isDone = (h, comps, d) => doneValue(comps, d, h.id) >= (h.quant ? h.quantTarget : 1); // quality: any intensity ≥1 counts as done

function calcStreak(h, comps, grace) {
  if (h.type === "tpw") {
    const thisWk = weekStart(todayStr());
    const weekCount = (ws) => { let n = 0; for (let i = 0; i < 7; i++) if (isDone(h, comps, addDays(ws, i))) n++; return n; };
    let cur = 0, w = 1;
    while (w < 60 && weekCount(addDays(thisWk, -7 * w)) >= h.target) { cur++; w++; }
    if (weekCount(thisWk) >= h.target) cur++;
    let longest = 0, run = 0;
    for (let k = 59; k >= 0; k--) {
      if (weekCount(addDays(thisWk, -7 * k)) >= h.target) { run++; longest = Math.max(longest, run); }
      else if (k !== 0) run = 0;
    }
    return { current: cur, longest: Math.max(longest, cur), unit: "wk" };
  }
  const walk = (from) => {
    let n = 0, misses = 0, d = from;
    for (let i = 0; i < 400; i++) {
      if (isScheduled(h, d)) {
        if (isDone(h, comps, d)) n++;
        else { misses++; if (misses > (grace ? 1 : 0)) break; }
      }
      d = addDays(d, -1);
    }
    return n;
  };
  const current = isScheduled(h, todayStr()) && !isDone(h, comps, todayStr())
    ? walk(addDays(todayStr(), -1))
    : walk(todayStr());
  let longest = 0, run = 0, misses = 0;
  for (let i = 399; i >= 0; i--) {
    const d = addDays(todayStr(), -i);
    if (!isScheduled(h, d)) continue;
    if (isDone(h, comps, d)) { run++; misses = 0; }
    else { misses++; if (misses > (grace ? 1 : 0)) { run = 0; misses = 0; } }
    longest = Math.max(longest, run);
  }
  return { current, longest, unit: "day" };
}

function consistency(h, comps, from, to) {
  if (h.type === "tpw") {
    let days = 0, done = 0, d = from;
    while (d <= to) { if (isDone(h, comps, d)) done++; days++; d = addDays(d, 1); }
    const weeks = Math.max(1, days / 7);
    return Math.min(1, done / (weeks * h.target));
  }
  let sched = 0, done = 0, d = from;
  while (d <= to) {
    if (isScheduled(h, d)) { sched++; if (isDone(h, comps, d)) done++; }
    d = addDays(d, 1);
  }
  return sched ? done / sched : 0;
}

function dayProgress(habits, comps, d) {
  const scheduled = habits.filter((h) => !h.archived && (isScheduled(h, d) || doneValue(comps, d, h.id) > 0));
  const done = scheduled.filter((h) => isDone(h, comps, d)).length;
  return { done, total: scheduled.length };
}

function avgIntensity(h, comps, from, to) {
  let sum = 0, n = 0, d = from;
  while (d <= to) {
    const v = doneValue(comps, d, h.id);
    if (v > 0) { sum += v; n++; }
    d = addDays(d, 1);
  }
  return n ? sum / n : 0;
}

/* ---------------- hooks ---------------- */
function useCountUp(target, dur = 900) {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current; prev.current = target;
    const t0 = performance.now(); let raf;
    const step = (t) => {
      const p = Math.min(1, (t - t0) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      setVal(from + (target - from) * e);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, dur]);
  return val;
}

/* ---------------- shared components ---------------- */
function Ring({ size = 120, stroke = 10, progress, color, track, children }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))}
          style={{ transition: `stroke-dashoffset .9s ${EASE}, stroke .4s`, filter: `drop-shadow(0 0 5px ${color}66)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

function StreakBadge({ streak, T, accent }) {
  if (!streak.current) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ background: accent + "1F", color: accent, boxShadow: `inset 0 0 0 1px ${accent}30` }}
      title={`Current streak: ${streak.current} ${streak.unit}${streak.current === 1 ? "" : "s"} · longest ${streak.longest}`}
    >
      <Flame size={12} strokeWidth={2.5} /> {streak.current}
    </span>
  );
}

function CheckButton({ done, onClick, accent, T, label }) {
  const [pop, setPop] = useState(false);
  return (
    <button
      aria-label={label}
      aria-pressed={done}
      onClick={() => { onClick(); if (!done) { setPop(true); setTimeout(() => setPop(false), 500); } }}
      className="relative flex items-center justify-center rounded-full outline-none"
      style={{
        width: 34, height: 34, flexShrink: 0,
        border: `2px solid ${done ? accent : T.border}`,
        background: done ? accent : "transparent",
        boxShadow: done ? `0 0 0 5px ${accent}26, 0 0 18px ${accent}66` : "none",
        transform: pop ? "scale(1.18)" : "scale(1)",
        transitionProperty: "background, border-color, box-shadow, transform",
        transitionDuration: ".3s, .3s, .45s, .3s",
        transitionTimingFunction: `${SPRING}`,
      }}
    >
      <Check size={18} strokeWidth={3.2} color="#0A0A0F"
        style={{ opacity: done ? 1 : 0, transform: done ? "scale(1)" : "scale(.4)", transition: `all .28s ${SPRING}` }} />
      {pop && <span className="hb-glow" style={{ background: accent }} />}
    </button>
  );
}

/* ---------------- swipeable row (mobile: swipe right to complete, left to archive) ---------------- */
function SwipeRow({ children, onComplete, onArchive, accent, disabled }) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const threshold = 76;

  const handleStart = (e) => { if (disabled) return; startX.current = e.touches[0].clientX; setDragging(true); };
  const handleMove = (e) => {
    if (!dragging) return;
    setDx(Math.max(-112, Math.min(112, e.touches[0].clientX - startX.current)));
  };
  const handleEnd = () => {
    if (dx > threshold) onComplete && onComplete();
    else if (dx < -threshold) onArchive && onArchive();
    setDx(0); setDragging(false);
  };

  return (
    <div className="relative" onTouchStart={handleStart} onTouchMove={handleMove} onTouchEnd={handleEnd}>
      <div aria-hidden className="md:hidden absolute inset-0 flex items-center justify-between px-6 rounded-2xl pointer-events-none"
        style={{
          background: dx > 4 ? `${accent}22` : dx < -4 ? "#FF6B7A22" : "transparent",
          opacity: Math.min(1, Math.abs(dx) / threshold),
        }}>
        <Check size={18} style={{ color: accent }} />
        <Archive size={18} style={{ color: "#FF6B7A" }} />
      </div>
      <div style={{ transform: `translateX(${dx}px)`, transition: dragging ? "none" : `transform .35s ${SPRING}` }}>
        {children}
      </div>
    </div>
  );
}

/* ---------------- Intensity Grid (Quality tracking mode) ---------------- */
const ZOOMS = [["W", 7], ["M", 35], ["Y", 364]];

function IntensityGrid({ h, comps, setComp, T, zoom, selectedDate }) {
  const base = hColor(h);
  const days = ZOOMS.find((z) => z[0] === zoom)[1];
  const end = todayStr();
  // align to week columns for M/Y; simple 7-day row for W
  const cellPx = zoom === "W" ? 30 : zoom === "M" ? 17 : 11;
  const gap = zoom === "Y" ? 3 : 4;
  const cells = [];
  if (zoom === "W") {
    for (let i = 6; i >= 0; i--) cells.push(addDays(end, -i));
  } else {
    const weeks = Math.ceil(days / 7);
    const startW = addDays(weekStart(end), -(weeks - 1) * 7);
    for (let w = 0; w < weeks; w++) for (let r = 0; r < 7; r++) cells.push(addDays(startW, w * 7 + r));
  }
  return (
    <div className={zoom === "Y" ? "overflow-x-auto pb-1 hb-scroll" : ""}>
      <div
        className={zoom === "W" ? "flex" : "grid grid-flow-col"}
        style={zoom === "W" ? { gap } : { gridTemplateRows: `repeat(7, ${cellPx}px)`, gap, width: "max-content" }}
      >
        {cells.map((d, i) => {
          const future = d > end;
          const lvl = doneValue(comps, d, h.id);
          const sched = isScheduled(h, d);
          return (
            <button
              key={d}
              disabled={future}
              aria-label={`${prettyDate(d)}: ${INTENSITY_LABELS[lvl]}${lvl ? ` (level ${lvl} of ${MAX_LVL})` : ""}. Tap to ${lvl >= MAX_LVL ? "reset" : "increase"}.`}
              title={future ? "" : `${prettyDate(d)} — ${INTENSITY_LABELS[lvl]}${lvl ? ` · ${lvl}/${MAX_LVL}` : ""}`}
              onClick={() => setComp(d, h.id, (lvl + 1) % (MAX_LVL + 1))}
              className="hb-cell rounded-md outline-none"
              style={{
                width: cellPx, height: cellPx, flexShrink: 0,
                ...(future ? { background: "transparent" } : cellStyle(base, lvl, T)),
                opacity: future ? 0 : sched || lvl ? 1 : 0.35,
                outline: d === selectedDate && zoom === "W" ? `1.5px solid ${base}88` : "none",
                outlineOffset: 2,
                animation: `hbFade .5s ${Math.min(i * 2, 400)}ms both`,
              }}
            />
          );
        })}
      </div>
      {zoom === "W" && (
        <div className="flex mt-1.5" style={{ gap }}>
          {cells.map((d) => (
            <span key={d} className="text-center text-[9px] font-semibold uppercase" style={{ width: cellPx, color: d === end ? base : T.faint }}>
              {DOW_SHORT[dow(d)][0]}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function QualityCard({ h, comps, setComp, T, accent, grace, index, selectedDate }) {
  const [zoom, setZoom] = useState("M");
  const base = hColor(h);
  const streak = calcStreak(h, comps, grace);
  const todayLvl = doneValue(comps, selectedDate, h.id);
  const from = addDays(todayStr(), -(ZOOMS.find((z) => z[0] === zoom)[1] - 1));
  const avg = avgIntensity(h, comps, from, todayStr());
  return (
    <div
      className="hb-rise hb-card relative rounded-3xl p-4 overflow-hidden"
      style={{
        background: T.surface, border: `1px solid ${T.border}`, boxShadow: T.shadow,
        animationDelay: `${index * 45}ms`,
        "--glow-border": base + "45",
        "--glow-shadow": `0 0 0 1px ${base}30, 0 6px 44px -6px ${base}38, ${T.shadow}`,
      }}
    >
      {/* ambient glow bleeding through the glass */}
      <div aria-hidden className="absolute pointer-events-none" style={{
        inset: -40, background: `radial-gradient(circle at 18% 0%, ${base}20, transparent 55%)`,
      }} />
      <div className="relative">
        <div className="flex items-center gap-2.5 mb-3">
          <span className="flex items-center justify-center rounded-xl text-lg" aria-hidden
            style={{ width: 36, height: 36, background: base + "1C", boxShadow: `inset 0 0 0 1px ${base}35` }}>{h.emoji}</span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold truncate" style={{ color: T.text }}>{h.name}</p>
              <StreakBadge streak={streak} T={T} accent={base} />
            </div>
            <p className="text-xs" style={{ color: T.faint }}>
              {todayLvl ? `${selectedDate === todayStr() ? "Today" : "Selected day"}: ${INTENSITY_LABELS[todayLvl]}` : "Tap squares to log intensity"}
              {avg > 0 && ` · avg ${avg.toFixed(1)}/${MAX_LVL}`}
            </p>
          </div>
          <div className="flex rounded-full p-0.5" style={{ background: T.surface2 }} role="tablist" aria-label={`${h.name} grid zoom`}>
            {ZOOMS.map(([z]) => (
              <button key={z} role="tab" aria-selected={zoom === z} onClick={() => setZoom(z)}
                className="rounded-full px-2 py-0.5 text-[10px] font-bold"
                style={{ background: zoom === z ? base : "transparent", color: zoom === z ? "#0A0A0F" : T.faint, transition: `all .3s ${EASE}` }}>
                {z}
              </button>
            ))}
          </div>
        </div>
        <IntensityGrid h={h} comps={comps} setComp={setComp} T={T} zoom={zoom} selectedDate={selectedDate} />
        <div className="flex items-center gap-1.5 mt-3">
          <span className="text-[10px]" style={{ color: T.faint }}>less</span>
          {Array.from({ length: MAX_LVL + 1 }, (_, l) => (
            <span key={l} className="rounded-[3px]" style={{ width: 9, height: 9, ...cellStyle(base, l, T) }} />
          ))}
          <span className="text-[10px]" style={{ color: T.faint }}>more</span>
        </div>
        <TimeTools h={h} date={selectedDate} T={T} />
      </div>
    </div>
  );
}

/* ---------------- time tracking (context + per-habit tools) ---------------- */
const TimeCtx = React.createContext(null);
const fmtDur = (secs) => {
  const s = Math.max(0, Math.round(secs));
  if (s < 3600) return `${Math.floor(s / 60)}:${pad(s % 60)}`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
};
const fmtMins = (secs) => { const m = Math.round(secs / 60); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60}m`; };

function TimeTools({ h, date, T }) {
  const ctx = React.useContext(TimeCtx);
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState("");
  if (!ctx) return null;
  const { times, timer, now, startTimer, pauseTimer, resumeTimer, stopTimer, addMinutes } = ctx;
  const base = hColor(h);
  const saved = (times[date] && times[date][h.id]) || 0;
  const mine = timer && timer.habitId === h.id;
  const live = mine ? timer.acc + (timer.running ? (now - timer.startedAt) / 1000 : 0) : 0;
  const btn = { background: T.surface2, border: `1px solid ${T.border}`, color: T.text };
  return (
    <div className="w-full mt-2 flex items-center gap-1.5 flex-wrap">
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label={`Time tools for ${h.name}`}
        className="hb-press flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums"
        style={{
          background: mine ? base + "1F" : T.surface2, color: mine ? base : T.muted,
          border: `1px solid ${mine ? base + "55" : T.border}`,
          boxShadow: mine && timer.running ? `0 0 12px -2px ${base}88` : "none",
          transition: `all .3s ${EASE}`,
        }}>
        <Clock3 size={11} /> {mine ? fmtDur(live) : saved ? fmtMins(saved) : "track time"}
      </button>
      {open && (
        <>
          {!mine && (
            <button aria-label={`Start timer for ${h.name}`} onClick={() => startTimer(h)}
              className="hb-press rounded-full p-1.5" style={btn}><Play size={12} /></button>
          )}
          {mine && timer.running && (
            <button aria-label="Pause timer" onClick={pauseTimer} className="hb-press rounded-full p-1.5" style={btn}><Pause size={12} /></button>
          )}
          {mine && !timer.running && (
            <button aria-label="Resume timer" onClick={resumeTimer} className="hb-press rounded-full p-1.5" style={btn}><Play size={12} /></button>
          )}
          {mine && (
            <button aria-label="Stop timer and save" onClick={stopTimer}
              className="hb-press flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{ background: base, color: "#0A0A0F", boxShadow: `0 0 14px -2px ${base}99` }}>
              <StopCircle size={12} /> save
            </button>
          )}
          <span className="flex items-center gap-1">
            <input type="number" min="1" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="min"
              aria-label={`Minutes spent on ${h.name}`}
              className="w-14 rounded-full px-2 py-1 text-[11px] outline-none tabular-nums" style={btn} />
            <button disabled={!+manual} onClick={() => { addMinutes(date, h.id, +manual); setManual(""); }}
              className="hb-press rounded-full px-2.5 py-1 text-[11px] font-semibold"
              style={{
                background: +manual ? base + "22" : T.surface2, color: +manual ? base : T.faint,
                border: `1px solid ${+manual ? base + "55" : T.border}`,
              }}>add</button>
          </span>
          {mine && timer.date !== date && <span className="text-[10px]" style={{ color: T.faint }}>timer saves to {timer.date}</span>}
        </>
      )}
    </div>
  );
}

function Skel({ T, style, className = "" }) {
  return (
    <div className={`hb-skel ${className}`} style={{ background: T.surface2, borderRadius: 10, ...style }} />
  );
}

function Splash({ T, accent }) {
  return (
    <div className="fixed inset-0 z-50 overflow-hidden px-4 sm:px-8 pt-6 sm:pt-10 pb-28 md:pb-12"
      style={{ background: T.bg }} role="status" aria-label="Loading your habits">
      <style>{`
        @keyframes hbShimmer { 0% { background-position: -220px 0; } 100% { background-position: 220px 0; } }
        .hb-skel { position: relative; overflow: hidden; }
        .hb-skel::after {
          content: ""; position: absolute; inset: 0;
          background: linear-gradient(90deg, transparent, ${T.text}14, transparent);
          background-size: 220px 100%; animation: hbShimmer 1.4s ease-in-out infinite;
        }
      `}</style>
      <div className="max-w-2xl mx-auto w-full">
        <div className="flex items-end justify-between mb-5">
          <div className="flex flex-col gap-2">
            <Skel T={T} style={{ width: 70, height: 14 }} />
            <Skel T={T} style={{ width: 160, height: 30 }} />
          </div>
          <Skel T={T} style={{ width: 110, height: 34, borderRadius: 999 }} />
        </div>
        <div className="grid grid-cols-7 gap-1.5 mb-6">
          {Array.from({ length: 7 }, (_, i) => <Skel key={i} T={T} style={{ height: 68, borderRadius: 16 }} />)}
        </div>
        <Skel T={T} style={{ height: 128, borderRadius: 24, marginBottom: 24 }} />
        <div className="flex flex-col gap-2.5">
          {Array.from({ length: 4 }, (_, i) => <Skel key={i} T={T} style={{ height: 72, borderRadius: 16 }} />)}
        </div>
      </div>
    </div>
  );
}

function ErrorToast({ msg, onClose, T }) {
  return (
    <div className="hb-pop fixed bottom-20 md:bottom-6 right-4 z-50 flex items-start gap-2 rounded-2xl px-4 py-3 max-w-xs"
      style={{ background: T.solid, border: "1px solid #FF6B7A55", boxShadow: T.shadow, backdropFilter: "blur(14px)" }} role="alert">
      <p className="text-xs leading-relaxed" style={{ color: "#FF9A9A" }}>{msg}</p>
      <button onClick={onClose} aria-label="Dismiss" className="rounded-full p-0.5 flex-shrink-0" style={{ color: T.faint }}><X size={13} /></button>
    </div>
  );
}

/* ---------------- Today view ---------------- */
function QuantRow({ h, value, onChange, accent, T }) {
  const done = value >= h.quantTarget;
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm tabular-nums font-medium" style={{ color: T.muted }}>
        {value}/{h.quantTarget}
      </span>
      <Ring size={34} stroke={4} progress={value / h.quantTarget} color={accent} track={T.ringTrack} />
      <div className="flex flex-col gap-1">
        <button aria-label={`Add one ${h.unit || "unit"} to ${h.name}`} onClick={() => onChange(Math.min(h.quantTarget, value + 1))}
          className="hb-press rounded-md p-0.5" style={{ background: T.surface2, color: done ? accent : T.text }}>
          <Plus size={13} />
        </button>
        <button aria-label={`Remove one from ${h.name}`} onClick={() => onChange(Math.max(0, value - 1))}
          className="hb-press rounded-md p-0.5" style={{ background: T.surface2, color: T.muted }}>
          <Minus size={13} />
        </button>
      </div>
    </div>
  );
}

function TodayView({ habits, comps, setComp, date, setDate, T, accent, grace, onQuickAdd, onStarter, onArchive }) {
  const active = habits.filter((h) => !h.archived).sort((a, b) => a.order - b.order);
  const scheduled = active.filter((h) => isScheduled(h, date) || doneValue(comps, date, h.id) > 0);
  const doneCount = scheduled.filter((h) => isDone(h, comps, date)).length;
  const pct = scheduled.length ? doneCount / scheduled.length : 0;
  const pctAnim = useCountUp(Math.round(pct * 100));
  const [quick, setQuick] = useState("");
  const isToday = date === todayStr();
  const simple = scheduled.filter((h) => !isQuality(h));
  const quality = active.filter((h) => isQuality(h));

  const week = useMemo(() => {
    const ws = weekStart(todayStr());
    return Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  }, []);

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="flex items-end justify-between mb-5">
        <div>
          <p className="text-sm font-medium" style={{ color: T.muted }}>{isToday ? "Today" : "Editing past day"}</p>
          <h1 className="hb-display text-3xl tracking-tight" style={{ color: T.text }}>{prettyDate(date)}</h1>
        </div>
        <label className="hb-press flex items-center gap-1.5 text-sm rounded-full px-3 py-1.5 cursor-pointer"
          style={{ background: T.surface, border: `1px solid ${T.border}`, color: T.muted }}>
          <CalendarDays size={15} />
          <span className="hidden sm:inline">Pick date</span>
          <input type="date" aria-label="Pick a date to view or edit" value={date} max={todayStr()}
            onChange={(e) => e.target.value && setDate(e.target.value)}
            className="w-0 h-0 opacity-0 absolute" />
        </label>
      </div>

      {/* week strip */}
      <div className="grid grid-cols-7 gap-1.5 mb-6">
        {week.map((d) => {
          const sched = active.filter((h) => isScheduled(h, d));
          const dn = sched.filter((h) => isDone(h, comps, d)).length;
          const sel = d === date, future = d > todayStr();
          return (
            <button key={d} disabled={future} onClick={() => setDate(d)}
              aria-label={`Select ${prettyDate(d)}`}
              className="hb-card flex flex-col items-center rounded-2xl py-2 gap-1"
              style={{
                background: sel ? accent : T.surface,
                border: `1px solid ${sel ? accent : T.border}`,
                opacity: future ? 0.35 : 1,
                transition: `background .3s, border-color .3s, transform .3s ${SPRING}, box-shadow .4s`,
                transform: sel ? "translateY(-2px)" : "none",
                boxShadow: sel ? `0 8px 26px -6px ${accent}66` : "none",
                "--glow-border": accent + "50",
                "--glow-shadow": `0 0 0 1px ${accent}30, 0 6px 24px -8px ${accent}44`,
              }}>
              <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: sel ? "#0A0A0F" : T.faint }}>
                {DOW_SHORT[dow(d)]}
              </span>
              <span className="text-sm font-semibold tabular-nums" style={{ color: sel ? "#0A0A0F" : T.text }}>{parse(d).getDate()}</span>
              <span className="h-1 w-1 rounded-full"
                style={{ background: sched.length && dn === sched.length ? (sel ? "#0A0A0F" : accent) : "transparent" }} />
            </button>
          );
        })}
      </div>

      {/* daily ring */}
      <div className="hb-card relative overflow-hidden flex items-center gap-5 rounded-3xl p-5 mb-6"
        style={{
          background: T.surface, border: `1px solid ${T.border}`, boxShadow: T.shadow,
          "--glow-border": accent + "40", "--glow-shadow": `0 0 0 1px ${accent}26, 0 8px 44px -8px ${accent}30, ${T.shadow}`,
        }}>
        <div aria-hidden className="absolute pointer-events-none" style={{ inset: -50, background: `radial-gradient(circle at 8% 20%, ${accent}1E, transparent 50%)` }} />
        <Ring size={104} stroke={11} progress={pct} color={accent} track={T.ringTrack}>
          <span className="hb-display hb-reveal text-2xl tabular-nums" style={{ color: T.text }}>{Math.round(pctAnim)}%</span>
        </Ring>
        <div className="relative">
          <p className="hb-display text-lg" style={{ color: T.text }}>
            {doneCount} of {scheduled.length} done
          </p>
          <p className="text-sm mt-0.5" style={{ color: T.muted }}>
            {pct === 1 ? "A perfect day. Beautifully done." :
              pct >= 0.5 ? "Past halfway — keep the rhythm going." :
              doneCount > 0 ? "A start is a start. One more?" : "The first check is the easiest win."}
          </p>
          {grace && <p className="text-xs mt-1.5 flex items-center gap-1" style={{ color: T.faint }}><Sparkles size={12} /> Streak grace is on — one miss won't break you</p>}
        </div>
      </div>

      {/* simple checklist */}
      <div className="flex flex-col gap-2">
        {simple.map((h, i) => {
          const v = doneValue(comps, date, h.id);
          const done = isDone(h, comps, date);
          const streak = calcStreak(h, comps, grace);
          const c = hColor(h);
          return (
            <SwipeRow key={h.id} accent={accent} disabled={h.quant}
              onComplete={() => !done && setComp(date, h.id, 1)}
              onArchive={() => onArchive && onArchive(h.id)}>
              <div className="hb-rise hb-card flex flex-col rounded-2xl px-4 py-3"
                style={{
                  background: T.surface, border: `1px solid ${T.border}`,
                  animationDelay: `${i * 45}ms`,
                  opacity: done ? 0.7 : 1, transition: `opacity .4s, box-shadow .45s ${EASE}, border-color .45s`,
                  "--glow-border": c + "40",
                  "--glow-shadow": `0 0 0 1px ${c}26, 0 6px 30px -8px ${c}33`,
                }}>
                <div className="flex items-center gap-3 w-full">
                <span className="text-xl w-8 text-center" aria-hidden>{h.emoji}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium truncate" style={{ color: T.text, textDecoration: done && !h.quant ? "line-through" : "none", textDecorationColor: T.faint }}>
                      {h.name}
                    </p>
                    <StreakBadge streak={streak} T={T} accent={accent} />
                  </div>
                  <p className="text-xs flex items-center gap-1.5" style={{ color: T.faint }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: catColor(h.category), boxShadow: `0 0 5px ${catColor(h.category)}88` }} />
                    {h.category}
                    {h.type === "tpw" && ` · ${h.target}× a week`}
                    {h.desc && ` · ${h.desc}`}
                  </p>
                </div>
                {h.quant
                  ? <QuantRow h={h} value={v} onChange={(nv) => setComp(date, h.id, nv)} accent={accent} T={T} />
                  : <CheckButton done={done} label={`Mark ${h.name} ${done ? "incomplete" : "complete"}`}
                      onClick={() => setComp(date, h.id, done ? 0 : 1)} accent={accent} T={T} />}
                </div>
                <TimeTools h={h} date={date} T={T} />
              </div>
            </SwipeRow>
          );
        })}
      </div>

      {/* quality widgets */}
      {quality.length > 0 && (
        <>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest mt-7 mb-2.5" style={{ color: T.faint }}>
            <Zap size={12} /> Quality habits — tap to intensify
          </p>
          <div className="flex flex-col gap-3">
            {quality.map((h, i) => (
              <QualityCard key={h.id} h={h} comps={comps} setComp={setComp} T={T} accent={accent} grace={grace} index={i} selectedDate={date} />
            ))}
          </div>
        </>
      )}

      {active.length === 0 && (
        <div className="hb-card hb-rise rounded-3xl p-8 text-center" style={{ background: T.surface, border: `1px solid ${T.border}`, boxShadow: T.shadow }}>
          <p className="text-3xl mb-3" aria-hidden>{"\u{1F331}"}</p>
          <p className="hb-display text-lg mb-1" style={{ color: T.text }}>No habits yet</p>
          <p className="text-sm mb-4" style={{ color: T.muted }}>Create one below, or begin with a curated starter set.</p>
          <button onClick={onStarter} className="hb-press rounded-full px-4 py-2 text-sm font-semibold"
            style={{ background: accent, color: "#0A0A0F", boxShadow: `0 6px 22px -4px ${accent}88` }}>
            Add starter habits
          </button>
        </div>
      )}

      {/* quick add */}
      <form className="mt-4 flex items-center gap-2 rounded-2xl px-4 py-2.5"
        style={{ background: T.surface2, border: `1px dashed ${T.border}` }}
        onSubmit={(e) => { e.preventDefault(); if (quick.trim()) { onQuickAdd(quick.trim()); setQuick(""); } }}>
        <Plus size={16} style={{ color: T.faint }} />
        <input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Quick-add a daily habit…"
          aria-label="Quick-add a daily habit"
          className="flex-1 bg-transparent outline-none text-sm" style={{ color: T.text }} />
        {quick && <button type="submit" className="text-sm font-semibold" style={{ color: accent }}>Add</button>}
      </form>
    </div>
  );
}

/* ---------------- Habit editor modal ---------------- */
function HabitModal({ initial, onSave, onClose, T, accent }) {
  const [h, setH] = useState(initial || {
    name: "", emoji: "✨", desc: "", category: "Health", type: "daily", mode: "simple", color: null,
    days: [1, 2, 3, 4, 5], target: 3, quant: false, quantTarget: 8, unit: "",
  });
  const set = (k, v) => setH((p) => ({ ...p, [k]: v }));
  const field = { background: T.surface2, border: `1px solid ${T.border}`, color: T.text };
  const base = hColor(h);
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-6"
      style={{ background: "rgba(6,6,10,.55)", backdropFilter: "blur(10px)" }}
      onClick={onClose}>
      <div className="hb-modal w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-6 max-h-[90vh] overflow-y-auto hb-scroll"
        style={{ background: T.solid, border: `1px solid ${T.border}`, boxShadow: T.shadow }}
        onClick={(e) => e.stopPropagation()} role="dialog" aria-label={initial ? "Edit habit" : "New habit"}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="hb-display text-xl" style={{ color: T.text }}>{initial ? "Edit habit" : "New habit"}</h2>
          <button onClick={onClose} aria-label="Close" className="hb-press rounded-full p-1.5" style={{ background: T.surface2, color: T.muted }}><X size={16} /></button>
        </div>
        <div className="flex gap-2 mb-3">
          <input value={h.emoji} onChange={(e) => set("emoji", e.target.value)} aria-label="Emoji"
            className="w-14 rounded-xl px-2 py-2.5 text-center text-lg outline-none" style={field} />
          <input value={h.name} onChange={(e) => set("name", e.target.value)} placeholder="Habit name" aria-label="Habit name"
            className="flex-1 rounded-xl px-3 py-2.5 text-sm outline-none" style={field} />
        </div>
        <input value={h.desc} onChange={(e) => set("desc", e.target.value)} placeholder="Description (optional)" aria-label="Description"
          className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mb-4" style={field} />

        <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: T.faint }}>Tracking mode</p>
        <div className="flex gap-1.5 mb-4">
          {[["simple", "Simple", "Done / not done"], ["quality", "Quality", "Intensity grid, 4 levels"]].map(([k, label, sub]) => (
            <button key={k} onClick={() => set("mode", k)}
              className="flex-1 rounded-xl px-3 py-2.5 text-left"
              style={{
                background: h.mode === k ? accent + "1C" : T.surface2,
                border: `1px solid ${h.mode === k ? accent : T.border}`,
                transition: `all .25s ${EASE}`,
              }}>
              <span className="block text-sm font-semibold" style={{ color: h.mode === k ? accent : T.text }}>{label}</span>
              <span className="block text-[11px]" style={{ color: T.faint }}>{sub}</span>
            </button>
          ))}
        </div>

        {h.mode === "quality" && (
          <>
            <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: T.faint }}>Glow color</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {HABIT_COLORS.map((c) => (
                <button key={c} aria-label={`Color ${c}`} onClick={() => set("color", c)}
                  className="rounded-full" style={{
                    width: 24, height: 24, background: c,
                    boxShadow: (h.color || "") === c ? `0 0 0 2px ${T.solid}, 0 0 0 4px ${c}, 0 0 12px ${c}88` : "none",
                    transform: (h.color || "") === c ? "scale(1.12)" : "scale(1)", transition: `all .3s ${SPRING}`,
                  }} />
              ))}
            </div>
            <div className="flex items-center gap-1.5 mb-4">
              {Array.from({ length: MAX_LVL + 1 }, (_, l) => <span key={l} className="rounded-[3px]" style={{ width: 12, height: 12, ...cellStyle(base, l, T) }} />)}
              <span className="text-[11px] ml-1" style={{ color: T.faint }}>your intensity scale</span>
            </div>
          </>
        )}

        <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: T.faint }}>Category</p>
        <div className="flex flex-wrap gap-1.5 mb-4">
          {CATEGORIES.map((c) => (
            <button key={c.name} onClick={() => set("category", c.name)}
              className="flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
              style={{
                background: h.category === c.name ? c.color + "22" : T.surface2,
                border: `1px solid ${h.category === c.name ? c.color : T.border}`,
                color: h.category === c.name ? c.color : T.muted, transition: `all .25s ${EASE}`,
              }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} />{c.name}
            </button>
          ))}
        </div>

        <p className="text-xs font-semibold uppercase tracking-wide mb-1.5" style={{ color: T.faint }}>Repeats</p>
        <div className="flex gap-1.5 mb-3">
          {[["daily", "Every day"], ["days", "Specific days"], ["tpw", "Times per week"]].map(([k, label]) => (
            <button key={k} onClick={() => set("type", k)}
              className="flex-1 rounded-xl px-2 py-2 text-xs font-medium"
              style={{
                background: h.type === k ? accent + "1A" : T.surface2,
                border: `1px solid ${h.type === k ? accent : T.border}`,
                color: h.type === k ? accent : T.muted, transition: `all .25s ${EASE}`,
              }}>{label}</button>
          ))}
        </div>
        {h.type === "days" && (
          <div className="flex gap-1 mb-3">
            {DOW_SHORT.map((d, i) => (
              <button key={d} onClick={() => set("days", h.days.includes(i) ? h.days.filter((x) => x !== i) : [...h.days, i])}
                aria-pressed={h.days.includes(i)}
                className="flex-1 rounded-lg py-1.5 text-xs font-semibold"
                style={{
                  background: h.days.includes(i) ? accent : T.surface2,
                  color: h.days.includes(i) ? "#0A0A0F" : T.muted, transition: `all .2s ${EASE}`,
                }}>{d[0]}</button>
            ))}
          </div>
        )}
        {h.type === "tpw" && (
          <label className="flex items-center gap-2 text-sm mb-3" style={{ color: T.muted }}>
            Target
            <input type="number" min={1} max={7} value={h.target} onChange={(e) => set("target", Math.max(1, Math.min(7, +e.target.value || 1)))}
              className="w-16 rounded-lg px-2 py-1.5 outline-none tabular-nums" style={field} /> times per week
          </label>
        )}

        {h.mode === "simple" && (
          <>
            <label className="flex items-center justify-between text-sm py-2 mb-1" style={{ color: T.text }}>
              <span>Quantifiable (e.g. 8 glasses)</span>
              <button role="switch" aria-checked={h.quant} onClick={() => set("quant", !h.quant)}
                className="relative rounded-full" style={{ width: 40, height: 24, background: h.quant ? accent : T.border, transition: "background .3s" }}>
                <span className="absolute top-0.5 rounded-full bg-white" style={{ width: 20, height: 20, left: h.quant ? 18 : 2, transition: `left .3s ${SPRING}` }} />
              </button>
            </label>
            {h.quant && (
              <div className="flex gap-2 mb-2">
                <input type="number" min={1} value={h.quantTarget} onChange={(e) => set("quantTarget", Math.max(1, +e.target.value || 1))}
                  aria-label="Daily target amount" className="w-20 rounded-lg px-2 py-1.5 text-sm outline-none tabular-nums" style={field} />
                <input value={h.unit} onChange={(e) => set("unit", e.target.value)} placeholder="unit (glasses, pages…)"
                  aria-label="Unit" className="flex-1 rounded-lg px-2 py-1.5 text-sm outline-none" style={field} />
              </div>
            )}
          </>
        )}

        <button disabled={!h.name.trim()} onClick={() => onSave({ ...h, quant: h.mode === "quality" ? false : h.quant })}
          className="hb-press w-full mt-4 rounded-2xl py-3 font-semibold"
          style={{
            background: accent, color: "#0A0A0F", opacity: h.name.trim() ? 1 : 0.45,
            boxShadow: `0 8px 28px -6px ${accent}77`, transition: `opacity .25s, transform .2s ${SPRING}`,
          }}>
          {initial ? "Save changes" : "Create habit"}
        </button>
      </div>
    </div>
  );
}

/* ---------------- Habits view ---------------- */
function HabitsView({ habits, actions, comps, T, accent, grace }) {
  const [modal, setModal] = useState(null);
  const dragFrom = useRef(null);
  const active = habits.filter((h) => !h.archived).sort((a, b) => a.order - b.order);
  const archived = habits.filter((h) => h.archived);

  const save = (h) => {
    if (modal === "new") actions.create(h);
    else actions.update(modal.id, h);
    setModal(null);
  };
  const reorder = (from, to) => {
    const ids = active.map((h) => h.id);
    const [m] = ids.splice(from, 1); ids.splice(to, 0, m);
    actions.reorder(ids);
  };

  return (
    <div className="max-w-2xl mx-auto w-full">
      <div className="flex items-center justify-between mb-5">
        <h1 className="hb-display text-3xl tracking-tight" style={{ color: T.text }}>Habits</h1>
        <button onClick={() => setModal("new")}
          className="hb-press flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold"
          style={{ background: accent, color: "#0A0A0F", boxShadow: `0 6px 22px -4px ${accent}88`, transition: `transform .2s ${SPRING}` }}>
          <Plus size={16} /> New habit
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {active.map((h, i) => {
          const streak = calcStreak(h, comps, grace);
          const c = hColor(h);
          return (
            <div key={h.id} draggable
              onDragStart={() => (dragFrom.current = i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragFrom.current != null && dragFrom.current !== i) reorder(dragFrom.current, i); dragFrom.current = null; }}
              className="hb-rise hb-card flex items-center gap-3 rounded-2xl px-3 py-3"
              style={{
                background: T.surface, border: `1px solid ${T.border}`, animationDelay: `${i * 40}ms`,
                "--glow-border": c + "40", "--glow-shadow": `0 0 0 1px ${c}26, 0 6px 30px -8px ${c}33`,
              }}>
              <GripVertical size={16} style={{ color: T.faint, cursor: "grab" }} aria-hidden />
              <span className="text-xl" aria-hidden>{h.emoji}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium truncate" style={{ color: T.text }}>{h.name}</p>
                  {isQuality(h) && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                      style={{ background: c + "1C", color: c, boxShadow: `inset 0 0 0 1px ${c}35` }}>
                      <Zap size={10} /> Quality
                    </span>
                  )}
                  <StreakBadge streak={streak} T={T} accent={accent} />
                </div>
                <p className="text-xs flex items-center gap-1.5" style={{ color: T.faint }}>
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: c, boxShadow: `0 0 5px ${c}88` }} />
                  {h.category} · {h.type === "daily" ? "every day" : h.type === "tpw" ? `${h.target}× a week` : h.days.map((d) => DOW_SHORT[d]).join(" ")}
                  {" · "}longest {streak.longest} {streak.unit}{streak.longest === 1 ? "" : "s"}
                </p>
              </div>
              <button aria-label={`Edit ${h.name}`} onClick={() => setModal(h)} className="hb-press rounded-full p-2" style={{ color: T.muted, background: T.surface2 }}><Pencil size={14} /></button>
              <button aria-label={`Archive ${h.name}`} onClick={() => actions.archive(h.id)}
                className="hb-press rounded-full p-2" style={{ color: T.muted, background: T.surface2 }}><Archive size={14} /></button>
            </div>
          );
        })}
      </div>

      {archived.length > 0 && (
        <>
          <p className="text-xs font-semibold uppercase tracking-wide mt-8 mb-2" style={{ color: T.faint }}>Archived — history kept safe</p>
          <div className="flex flex-col gap-2">
            {archived.map((h) => (
              <div key={h.id} className="flex items-center gap-3 rounded-2xl px-4 py-2.5" style={{ background: T.surface2, border: `1px solid ${T.border}`, opacity: 0.75 }}>
                <span aria-hidden>{h.emoji}</span>
                <p className="flex-1 text-sm" style={{ color: T.muted }}>{h.name}</p>
                <button aria-label={`Restore ${h.name}`} onClick={() => actions.restore(h.id)}
                  className="hb-press rounded-full p-2" style={{ color: T.muted }}><ArchiveRestore size={14} /></button>
                <button aria-label={`Delete ${h.name} forever`} onClick={() => actions.remove(h.id)}
                  className="hb-press rounded-full p-2" style={{ color: "#FF7A7A" }}><Trash2 size={14} /></button>
              </div>
            ))}
          </div>
        </>
      )}

      {modal && <HabitModal initial={modal === "new" ? null : modal} onSave={save} onClose={() => setModal(null)} T={T} accent={accent} />}
    </div>
  );
}

/* ---------------- Analysis ---------------- */
const RANGES = [["W", "Weekly", 7], ["M", "Monthly", 30], ["Q", "Quarterly", 90], ["Y", "Yearly", 365], ["∞", "All-time", 9999]];

function Heatmap({ habit, habits, comps, T, accent }) {
  const weeks = 16;
  const end = todayStr();
  const startW = addDays(weekStart(end), -(weeks - 1) * 7);
  const h = habit === "all" ? null : habits.find((x) => x.id === habit);
  const base = h ? hColor(h) : accent;
  const cells = [];
  for (let w = 0; w < weeks; w++) {
    for (let r = 0; r < 7; r++) {
      const d = addDays(startW, w * 7 + r);
      if (d > end) { cells.push({ d, rate: -1 }); continue; }
      let rate;
      if (!h) {
        const sched = habits.filter((x) => !x.archived && isScheduled(x, d));
        rate = sched.length ? sched.filter((x) => isDone(x, comps, d)).length / sched.length : 0;
      } else if (isQuality(h)) {
        rate = doneValue(comps, d, h.id) / MAX_LVL;
      } else {
        rate = isScheduled(h, d) ? (isDone(h, comps, d) ? 1 : 0) : (doneValue(comps, d, h.id) ? 1 : 0);
      }
      cells.push({ d, rate });
    }
  }
  return (
    <div className="overflow-x-auto pb-1 hb-scroll">
      <div className="grid grid-flow-col gap-1" style={{ gridTemplateRows: "repeat(7, 12px)", width: "max-content" }}>
        {cells.map((c, i) => (
          <div key={c.d} title={c.rate >= 0 ? `${prettyDate(c.d)} — ${Math.round(Math.max(0, c.rate) * 100)}%` : c.d}
            className="rounded-[3px]"
            style={{
              width: 12, height: 12,
              background: c.rate < 0 ? "transparent"
                : c.rate === 0 ? T.heat0
                : base + ["30", "58", "88", "C4", "FF"][Math.min(4, Math.floor(c.rate * 4.999))],
              boxShadow: c.rate >= 0.99 ? `0 0 6px ${base}88` : "none",
              animation: `hbFade .5s ${Math.min(i * 3, 450)}ms both`,
              transition: "background .6s, box-shadow .6s",
            }} />
        ))}
      </div>
    </div>
  );
}

function InsightCarousel({ insights, T, accent }) {
  const [i, setI] = useState(0);
  useEffect(() => { const t = setInterval(() => setI((p) => (p + 1) % insights.length), 6000); return () => clearInterval(t); }, [insights.length]);
  return (
    <div className="rounded-3xl p-5 relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${accent}16, ${accent}04)`, border: `1px solid ${accent}30`, backdropFilter: "blur(12px)" }}>
      <div aria-hidden className="absolute pointer-events-none" style={{ inset: -60, background: `radial-gradient(circle at 90% 0%, ${accent}22, transparent 55%)` }} />
      <div className="relative">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: accent }}>
          <Sparkles size={13} /> Insight
        </div>
        <p key={i} className="hb-slide text-base font-medium min-h-[3rem]" style={{ color: T.text }}>{insights[i]}</p>
        <div className="flex items-center gap-2 mt-3">
          <button aria-label="Previous insight" onClick={() => setI((i - 1 + insights.length) % insights.length)} className="hb-press rounded-full p-1" style={{ color: T.muted }}><ChevronLeft size={15} /></button>
          <div className="flex gap-1.5">
            {insights.map((_, k) => (
              <span key={k} className="rounded-full" style={{ width: k === i ? 16 : 5, height: 5, background: k === i ? accent : T.border, boxShadow: k === i ? `0 0 6px ${accent}88` : "none", transition: `all .4s ${EASE}` }} />
            ))}
          </div>
          <button aria-label="Next insight" onClick={() => setI((i + 1) % insights.length)} className="hb-press rounded-full p-1" style={{ color: T.muted }}><ChevronRight size={15} /></button>
        </div>
      </div>
    </div>
  );
}

function Recap({ habits, comps, onClose, T, accent, grace }) {
  const [step, setStep] = useState(0);
  const from = addDays(todayStr(), -29), to = todayStr();
  const active = habits.filter((h) => !h.archived);
  let total = 0; let d = from;
  while (d <= to) { active.forEach((h) => { if (isDone(h, comps, d)) total++; }); d = addDays(d, 1); }
  const best = [...active].sort((a, b) => consistency(b, comps, from, to) - consistency(a, comps, from, to))[0];
  const comeback = [...active].sort((a, b) => {
    const gain = (h) => consistency(h, comps, addDays(to, -14), to) - consistency(h, comps, from, addDays(to, -15));
    return gain(b) - gain(a);
  })[0];
  const longest = Math.max(...active.map((h) => calcStreak(h, comps, grace).longest));
  const qual = active.filter(isQuality).sort((a, b) => avgIntensity(b, comps, from, to) - avgIntensity(a, comps, from, to))[0];
  const slides = [
    { label: "checks in the last 30 days", big: total, sub: "Every one of them a small vote for who you're becoming." },
    { label: "your most consistent habit", big: `${best.emoji}`, title: best.name, sub: `${Math.round(consistency(best, comps, from, to) * 100)}% consistency this month.` },
    ...(qual ? [{ label: "highest average intensity", big: qual.emoji, title: qual.name, sub: `Averaging ${avgIntensity(qual, comps, from, to).toFixed(1)}/${MAX_LVL} when you show up. Quality, not just quantity.` }] : []),
    { label: "comeback story", big: `${comeback.emoji}`, title: comeback.name, sub: "Trending up in the last two weeks. Momentum looks good." },
    { label: "longest streak on record", big: longest, sub: "Days of showing up, back to back." },
  ];
  const s = slides[step];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 cursor-pointer"
      style={{ background: `radial-gradient(circle at 50% 30%, ${accent}30, ${T.bg} 72%)`, backdropFilter: "blur(14px)" }}
      onClick={() => (step < slides.length - 1 ? setStep(step + 1) : onClose())}>
      <button aria-label="Close recap" onClick={(e) => { e.stopPropagation(); onClose(); }} className="absolute top-5 right-5 rounded-full p-2" style={{ background: T.surface, color: T.muted }}><X size={18} /></button>
      <div key={step} className="hb-pop text-center max-w-sm">
        <p className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: accent }}>Monthly recap · {step + 1}/{slides.length}</p>
        <p className="hb-display hb-reveal tabular-nums" style={{ color: T.text, fontSize: typeof s.big === "number" ? "5.5rem" : "4.5rem", lineHeight: 1, textShadow: `0 0 40px ${accent}55` }}>{s.big}</p>
        {s.title && <p className="hb-display text-2xl mt-2" style={{ color: T.text }}>{s.title}</p>}
        <p className="text-sm font-medium mt-2" style={{ color: T.muted }}>{s.label}</p>
        <p className="text-sm mt-4" style={{ color: T.muted }}>{s.sub}</p>
        <p className="text-xs mt-8" style={{ color: T.faint }}>tap to continue</p>
      </div>
    </div>
  );
}

function AnalysisView({ habits, comps, times, T, accent, grace }) {
  const [range, setRange] = useState(1);
  const [heatHabit, setHeatHabit] = useState("all");
  const [recap, setRecap] = useState(false);
  const active = habits.filter((h) => !h.archived);
  const qualityHabits = active.filter(isQuality);
  const [intHabitRaw, setIntHabit] = useState(qualityHabits[0]?.id || "");
  const intHabit = qualityHabits.some((h) => h.id === intHabitRaw) ? intHabitRaw : (qualityHabits[0]?.id || "");
  const earliest = useMemo(() => Object.keys(comps).sort()[0] || todayStr(), [comps]);
  const days = Math.min(RANGES[range][2], Math.round((parse(todayStr()) - parse(earliest)) / DAY) + 1);
  const from = addDays(todayStr(), -(days - 1)), to = todayStr();

  const daily = useMemo(() => {
    const out = []; let d = from;
    while (d <= to) {
      const sched = active.filter((h) => isScheduled(h, d));
      out.push({ d, rate: sched.length ? Math.round((sched.filter((h) => isDone(h, comps, d)).length / sched.length) * 100) : 0 });
      d = addDays(d, 1);
    }
    return out;
  }, [comps, habits, days]);

  const series = useMemo(() => {
    if (days <= 31) return daily.map((x) => ({ label: `${MONTHS[parse(x.d).getMonth()]} ${parse(x.d).getDate()}`, rate: x.rate }));
    const byWeek = {};
    daily.forEach((x) => { const w = weekStart(x.d); (byWeek[w] = byWeek[w] || []).push(x.rate); });
    return Object.entries(byWeek).map(([w, v]) => ({ label: `${MONTHS[parse(w).getMonth()]} ${parse(w).getDate()}`, rate: Math.round(v.reduce((a, b) => a + b, 0) / v.length) }));
  }, [daily, days]);

  const intSeries = useMemo(() => {
    const h = habits.find((x) => x.id === intHabit);
    if (!h) return [];
    const pts = []; let d = from;
    while (d <= to) {
      pts.push({ d, v: doneValue(comps, d, h.id) });
      d = addDays(d, 1);
    }
    if (days <= 31) return pts.map((x) => ({ label: `${MONTHS[parse(x.d).getMonth()]} ${parse(x.d).getDate()}`, avg: x.v }));
    const byWeek = {};
    pts.forEach((x) => { const w = weekStart(x.d); (byWeek[w] = byWeek[w] || []).push(x.v); });
    return Object.entries(byWeek).map(([w, v]) => {
      const done = v.filter((x) => x > 0);
      return { label: `${MONTHS[parse(w).getMonth()]} ${parse(w).getDate()}`, avg: done.length ? +(done.reduce((a, b) => a + b, 0) / done.length).toFixed(2) : 0 };
    });
  }, [comps, intHabit, days]);

  const intPeak = useMemo(() => {
    const h = habits.find((x) => x.id === intHabit);
    if (!h) return null;
    const byWd = Array(7).fill(0).map(() => ({ sum: 0, n: 0 }));
    let d = from;
    while (d <= to) { const v = doneValue(comps, d, h.id); if (v > 0) { byWd[dow(d)].sum += v; byWd[dow(d)].n++; } d = addDays(d, 1); }
    let bi = 0, bv = 0;
    byWd.forEach((x, i) => { const a = x.n ? x.sum / x.n : 0; if (a > bv) { bv = a; bi = i; } });
    return bv ? { day: DOW_SHORT[bi], avg: bv } : null;
  }, [comps, intHabit, days]);

  const overall = daily.length ? Math.round(daily.reduce((a, x) => a + x.rate, 0) / daily.length) : 0;
  const overallAnim = useCountUp(overall);
  let totalChecks = 0; { let d = from; while (d <= to) { active.forEach((h) => { if (isDone(h, comps, d)) totalChecks++; }); d = addDays(d, 1); } }
  const checksAnim = useCountUp(totalChecks);
  const bestStreak = Math.max(0, ...active.map((h) => calcStreak(h, comps, grace).longest));
  const streakAnim = useCountUp(bestStreak);

  const perHabit = active
    .map((h) => ({ name: `${h.emoji} ${h.name}`, pct: Math.round(consistency(h, comps, from, to) * 100), fill: hColor(h) }))
    .sort((a, b) => b.pct - a.pct);

  const byDow = DOW_SHORT.map((label, wd) => {
    let sched = 0, done = 0;
    daily.forEach((x) => {
      if (dow(x.d) !== wd) return;
      active.forEach((h) => { if (isScheduled(h, x.d)) { sched++; if (isDone(h, comps, x.d)) done++; } });
    });
    return { label, pct: sched ? Math.round((done / sched) * 100) : 0 };
  });

  const byCat = CATEGORIES.map((c) => {
    let n = 0; let d = from;
    while (d <= to) { active.filter((h) => h.category === c.name).forEach((h) => { if (isDone(h, comps, d)) n++; }); d = addDays(d, 1); }
    return { name: c.name, value: n, fill: c.color };
  }).filter((x) => x.value > 0);

  const insights = useMemo(() => {
    const out = [];
    const wk = byDow.filter((_, i) => i >= 1 && i <= 5).reduce((a, x) => a + x.pct, 0) / 5;
    const we = (byDow[0].pct + byDow[6].pct) / 2;
    if (Math.abs(wk - we) > 3) out.push(`You're ${Math.round(Math.abs(wk - we))}% more consistent on ${wk > we ? "weekdays" : "weekends"}.`);
    const bestD = byDow.reduce((a, b) => (b.pct > a.pct ? b : a));
    out.push(`${bestD.label}days are your strongest — ${bestD.pct}% completion.`);
    if (perHabit[0]) out.push(`${perHabit[0].name} leads the pack at ${perHabit[0].pct}% consistency.`);
    qualityHabits.forEach((h) => {
      const byWd = Array(7).fill(0).map(() => ({ sum: 0, n: 0 }));
      let d = from;
      while (d <= to) { const v = doneValue(comps, d, h.id); if (v > 0) { byWd[dow(d)].sum += v; byWd[dow(d)].n++; } d = addDays(d, 1); }
      let bi = -1, bv = 0;
      byWd.forEach((x, i) => { const a = x.n ? x.sum / x.n : 0; if (a > bv) { bv = a; bi = i; } });
      if (bi >= 0) out.push(`${h.name} intensity peaks on ${DOW_SHORT[bi]}days — averaging ${bv.toFixed(1)}/${MAX_LVL}.`);
    });
    const streaky = active.map((h) => ({ h, s: calcStreak(h, comps, grace) })).sort((a, b) => b.s.longest - a.s.longest)[0];
    if (streaky) out.push(`Your longest streak ever is ${streaky.s.longest} ${streaky.s.unit}s on ${streaky.h.name}.`);
    const low = perHabit[perHabit.length - 1];
    if (low && low.pct < 60) out.push(`${low.name} could use some love — try anchoring it to an existing routine.`);
    return out;
  }, [comps, habits, range]);

  const tooltipStyle = { background: T.solid, border: `1px solid ${T.border}`, borderRadius: 12, color: T.text, fontSize: 12, boxShadow: T.shadow };
  const card = { background: T.surface, border: `1px solid ${T.border}`, boxShadow: T.shadow };
  const intColor = hColor(habits.find((x) => x.id === intHabit) || {});

  return (
    <div className="max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <h1 className="hb-display text-3xl tracking-tight" style={{ color: T.text }}>Analysis</h1>
        <div className="flex items-center gap-2">
          <div className="flex rounded-full p-1" style={{ background: T.surface2, border: `1px solid ${T.border}` }} role="tablist" aria-label="Time range">
            {RANGES.map(([short, label], i) => (
              <button key={label} role="tab" aria-selected={range === i} title={label} onClick={() => setRange(i)}
                className="rounded-full px-3 py-1 text-xs font-semibold"
                style={{
                  background: range === i ? accent : "transparent", color: range === i ? "#0A0A0F" : T.muted,
                  boxShadow: range === i ? `0 0 14px ${accent}66` : "none", transition: `all .3s ${EASE}`,
                }}>
                {short}
              </button>
            ))}
          </div>
          <button onClick={() => setRecap(true)} className="hb-press flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold"
            style={{ background: accent, color: "#0A0A0F", boxShadow: `0 5px 18px -2px ${accent}77` }}>
            <Sparkles size={13} /> Recap
          </button>
        </div>
      </div>

      <div key={range} className="hb-reveal grid grid-cols-3 gap-2 sm:gap-3 mb-4">
        {[[Math.round(overallAnim) + "%", "avg completion"], [Math.round(checksAnim), "habits checked"], [Math.round(streakAnim), "best streak (days/wks)"]].map(([v, l]) => (
          <div key={l} className="hb-card rounded-3xl p-4" style={{ ...card, "--glow-border": accent + "35", "--glow-shadow": `0 0 0 1px ${accent}22, 0 6px 30px -8px ${accent}2E, ${T.shadow}` }}>
            <p className="hb-display text-2xl sm:text-3xl tabular-nums" style={{ color: T.text }}>{v}</p>
            <p className="text-xs mt-0.5" style={{ color: T.faint }}>{l}</p>
          </div>
        ))}
      </div>

      <div className="mb-4"><InsightCarousel insights={insights} T={T} accent={accent} /></div>

      <div className="hb-card hb-glowline rounded-3xl p-5 mb-4" style={{ ...card, "--gl": accent + "99" }}>
        <p className="text-sm font-semibold mb-3" style={{ color: T.text }}>Completion rate · {RANGES[range][1].toLowerCase()}</p>
        <div style={{ height: 210 }}>
          <ResponsiveContainer>
            <AreaChart data={series} key={range} margin={{ left: -22, right: 6, top: 6 }}>
              <defs>
                <linearGradient id="hbArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={accent} stopOpacity={0.38} />
                  <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="label" tick={{ fill: T.faint, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
              <YAxis domain={[0, 100]} tick={{ fill: T.faint, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => v + "%"} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v + "%", "completion"]} cursor={{ stroke: T.border }} />
              <Area type="monotone" dataKey="rate" stroke={accent} strokeWidth={2.5} fill="url(#hbArea)"
                animationDuration={1100} animationEasing="ease-out" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {qualityHabits.length > 0 && (
        <div className="hb-card hb-glowline rounded-3xl p-5 mb-4" style={{ ...card, "--gl": intColor + "99", "--glow-border": intColor + "40", "--glow-shadow": `0 0 0 1px ${intColor}26, 0 6px 40px -8px ${intColor}33, ${T.shadow}` }}>
          <div className="flex items-center justify-between mb-1 gap-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: T.text }}><Zap size={14} style={{ color: intColor }} /> Intensity signal</p>
            <select value={intHabit} onChange={(e) => setIntHabit(e.target.value)} aria-label="Intensity habit"
              className="text-xs rounded-lg px-2 py-1.5 outline-none"
              style={{ background: T.surface2, color: T.muted, border: `1px solid ${T.border}` }}>
              {qualityHabits.map((h) => <option key={h.id} value={h.id}>{h.emoji} {h.name}</option>)}
            </select>
          </div>
          <p className="text-xs mb-3" style={{ color: T.faint }}>
            Average intensity {days <= 31 ? "per day" : "per week"} (0–{MAX_LVL})
            {intPeak && <> · peaks on <span style={{ color: intColor, fontWeight: 600 }}>{intPeak.day}days</span> at {intPeak.avg.toFixed(1)}</>}
          </p>
          <div style={{ height: 180 }}>
            <ResponsiveContainer>
              <AreaChart data={intSeries} key={range + intHabit} margin={{ left: -30, right: 6, top: 6 }}>
                <defs>
                  <linearGradient id="hbInt" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={intColor} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={intColor} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="label" tick={{ fill: T.faint, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
                <YAxis domain={[0, MAX_LVL]} ticks={Array.from({ length: MAX_LVL + 1 }, (_, i) => i)} tick={{ fill: T.faint, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v, "intensity"]} cursor={{ stroke: T.border }} />
                <Area type="monotone" dataKey="avg" stroke={intColor} strokeWidth={2.5} fill="url(#hbInt)"
                  animationDuration={1100} animationEasing="ease-out" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Time invested */}
      <div className="hb-card hb-glowline rounded-3xl p-5 mb-4" style={{ ...card, "--gl": accent + "99" }}>
        {(() => {
          const secsRange = (hid, a, b) => { let s = 0, d0 = a; while (d0 <= b) { s += (times[d0] && times[d0][hid]) || 0; d0 = addDays(d0, 1); } return s; };
          const tw0 = weekStart(todayStr()), lw0 = addDays(tw0, -7), lw1 = addDays(tw0, -1);
          const twSecs = active.reduce((s, h) => s + secsRange(h.id, tw0, todayStr()), 0);
          const lwSecs = active.reduce((s, h) => s + secsRange(h.id, lw0, lw1), 0);
          const wkDelta = lwSecs ? Math.round(((twSecs - lwSecs) / lwSecs) * 100) : (twSecs ? 100 : 0);
          const perHabitTime = active.map((h) => ({
            name: `${h.emoji} ${h.name}`,
            total: Math.round(secsRange(h.id, from, to) / 60),
            tw: Math.round(secsRange(h.id, tw0, todayStr()) / 60),
            lw: Math.round(secsRange(h.id, lw0, lw1) / 60),
            fill: hColor(h),
          })).filter((x) => x.total || x.tw || x.lw).sort((a, b) => b.total - a.total);
          const pts = daily.map((x) => ({ d: x.d, mins: Math.round(active.reduce((s, h) => s + ((times[x.d] && times[x.d][h.id]) || 0), 0) / 60) }));
          let minsSeries;
          if (days <= 31) minsSeries = pts.map((x) => ({ label: `${MONTHS[parse(x.d).getMonth()]} ${parse(x.d).getDate()}`, mins: x.mins }));
          else {
            const byWeek = {};
            pts.forEach((x) => { const w = weekStart(x.d); (byWeek[w] = byWeek[w] || []).push(x.mins); });
            minsSeries = Object.entries(byWeek).map(([w, v]) => ({ label: `${MONTHS[parse(w).getMonth()]} ${parse(w).getDate()}`, mins: v.reduce((a, b) => a + b, 0) }));
          }
          let activeTimeDays = 0, totalRangeSecs = 0;
          pts.forEach((x) => { if (x.mins > 0) { activeTimeDays++; totalRangeSecs += x.mins; } });
          const avgSession = activeTimeDays ? Math.round(totalRangeSecs / activeTimeDays) : 0;
          const anyTime = perHabitTime.length > 0;
          return (
            <>
              <div className="flex items-center justify-between flex-wrap gap-2 mb-1">
                <p className="flex items-center gap-1.5 text-sm font-semibold" style={{ color: T.text }}>
                  <Clock3 size={14} style={{ color: accent }} /> Time invested
                </p>
                <div className="flex gap-2 text-xs tabular-nums">
                  <span className="rounded-full px-2.5 py-1 font-semibold" style={{ background: accent + "1C", color: accent }}>
                    this wk {fmtMins(twSecs)}
                  </span>
                  <span className="rounded-full px-2.5 py-1 font-medium" style={{ background: T.surface2, color: T.muted }}>
                    last wk {fmtMins(lwSecs)}
                  </span>
                  <span className="flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold"
                    style={{ background: (wkDelta >= 0 ? "#3DDC97" : "#FF6B7A") + "1C", color: wkDelta >= 0 ? "#3DDC97" : "#FF9A9A" }}>
                    {wkDelta >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {wkDelta >= 0 ? "+" : ""}{wkDelta}%
                  </span>
                </div>
              </div>
              <p className="text-xs mb-3" style={{ color: T.faint }}>
                Minutes {days <= 31 ? "per day" : "per week"} across all habits
                {avgSession > 0 && <> · avg <span style={{ color: T.muted, fontWeight: 600 }}>{avgSession} min</span> per active day</>}
              </p>
              {anyTime ? (
                <>
                  <div style={{ height: 170 }}>
                    <ResponsiveContainer>
                      <AreaChart data={minsSeries} key={range + "t"} margin={{ left: -22, right: 6, top: 6 }}>
                        <defs>
                          <linearGradient id="hbTime" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={accent} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={accent} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="label" tick={{ fill: T.faint, fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={28} />
                        <YAxis tick={{ fill: T.faint, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => v + "m"} />
                        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v + " min", "time"]} cursor={{ stroke: T.border }} />
                        <Area type="monotone" dataKey="mins" stroke={accent} strokeWidth={2.5} fill="url(#hbTime)"
                          animationDuration={1100} animationEasing="ease-out" dot={false} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-xs font-semibold mt-4 mb-2" style={{ color: T.muted }}>This week vs last week, by habit (min)</p>
                  <div style={{ height: perHabitTime.length * 44 + 20 }}>
                    <ResponsiveContainer>
                      <BarChart data={perHabitTime} layout="vertical" key={range + "tb"} margin={{ left: 10, right: 40 }}>
                        <XAxis type="number" hide />
                        <YAxis type="category" dataKey="name" width={132} tick={{ fill: T.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
                        <Tooltip contentStyle={tooltipStyle}
                          formatter={(v, k) => [v + " min", k === "tw" ? "this week" : "last week"]} cursor={{ fill: T.surface2 }} />
                        <Bar dataKey="lw" radius={[5, 5, 5, 5]} barSize={9} fill={accent + "3D"} animationDuration={800} animationEasing="ease-out" />
                        <Bar dataKey="tw" radius={[5, 5, 5, 5]} barSize={9} animationDuration={900} animationEasing="ease-out"
                          label={{ position: "right", fill: T.faint, fontSize: 10, formatter: (v) => (v ? v + "m" : "") }}>
                          {perHabitTime.map((e, i) => <Cell key={i} fill={e.fill} />)}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <p className="text-sm rounded-2xl px-4 py-6 text-center" style={{ background: T.surface2, color: T.faint }}>
                  No time logged yet — use the <Clock3 size={12} className="inline" /> chip on any habit in Today to start a timer or add minutes.
                </p>
              )}
            </>
          );
        })()}
      </div>

      <div className="hb-card rounded-3xl p-5 mb-4" style={card}>
        <p className="text-sm font-semibold mb-3" style={{ color: T.text }}>Consistency by habit</p>
        <div style={{ height: perHabit.length * 38 + 20 }}>
          <ResponsiveContainer>
            <BarChart data={perHabit} layout="vertical" key={range} margin={{ left: 10, right: 34 }}>
              <XAxis type="number" domain={[0, 100]} hide />
              <YAxis type="category" dataKey="name" width={132} tick={{ fill: T.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v + "%", "consistency"]} cursor={{ fill: T.surface2 }} />
              <Bar dataKey="pct" radius={[6, 6, 6, 6]} barSize={14} animationDuration={900} animationEasing="ease-out"
                label={{ position: "right", fill: T.faint, fontSize: 11, formatter: (v) => v + "%" }}>
                {perHabit.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="hb-card rounded-3xl p-5 mb-4" style={card}>
        <div className="flex items-center justify-between mb-3 gap-2">
          <p className="text-sm font-semibold" style={{ color: T.text }}>Last 16 weeks</p>
          <select value={heatHabit} onChange={(e) => setHeatHabit(e.target.value)} aria-label="Heatmap habit filter"
            className="text-xs rounded-lg px-2 py-1.5 outline-none"
            style={{ background: T.surface2, color: T.muted, border: `1px solid ${T.border}` }}>
            <option value="all">All habits</option>
            {active.map((h) => <option key={h.id} value={h.id}>{h.emoji} {h.name}{isQuality(h) ? " ⚡" : ""}</option>)}
          </select>
        </div>
        <Heatmap habit={heatHabit} habits={habits} comps={comps} T={T} accent={accent} />
      </div>

      <div className="grid sm:grid-cols-2 gap-4 mb-4">
        <div className="hb-card rounded-3xl p-5" style={card}>
          <p className="text-sm font-semibold mb-3" style={{ color: T.text }}>Best day of the week</p>
          <div style={{ height: 170 }}>
            <ResponsiveContainer>
              <BarChart data={byDow} key={range} margin={{ left: -28, top: 4 }}>
                <XAxis dataKey="label" tick={{ fill: T.faint, fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: T.faint, fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={tooltipStyle} formatter={(v) => [v + "%", "completion"]} cursor={{ fill: T.surface2 }} />
                <Bar dataKey="pct" radius={[6, 6, 0, 0]} animationDuration={900}>
                  {byDow.map((e, i) => <Cell key={i} fill={e.pct === Math.max(...byDow.map((x) => x.pct)) ? accent : accent + "55"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="hb-card rounded-3xl p-5" style={card}>
          <p className="text-sm font-semibold mb-3" style={{ color: T.text }}>By category</p>
          <div style={{ height: 170 }} className="flex items-center">
            <ResponsiveContainer width="55%" height="100%">
              <PieChart>
                <Pie data={byCat} dataKey="value" innerRadius={44} outerRadius={68} paddingAngle={3} strokeWidth={0}
                  animationDuration={1000} animationEasing="ease-out">
                  {byCat.map((e, i) => <Cell key={i} fill={e.fill} />)}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2">
              {byCat.map((c) => (
                <div key={c.name} className="flex items-center gap-2 text-xs" style={{ color: T.muted }}>
                  <span className="h-2 w-2 rounded-full" style={{ background: c.fill, boxShadow: `0 0 5px ${c.fill}88` }} /> {c.name}
                  <span className="tabular-nums font-semibold" style={{ color: T.text }}>{c.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {recap && <Recap habits={habits} comps={comps} onClose={() => setRecap(false)} T={T} accent={accent} grace={grace} />}
    </div>
  );
}

/* ---------------- Settings ---------------- */
function SettingsView({ theme, setTheme, accent, setAccent, grace, setGrace, habits, comps, times, T, user, onSignOut,
  displayName, setDisplayName, avatarEmoji, setAvatarEmoji, avatarColor, setAvatarColor }) {
  const [nameDraft, setNameDraft] = useState(displayName);
  const [pickerOpen, setPickerOpen] = useState(false);
  const download = (name, content, type) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    URL.revokeObjectURL(url);
  };
  const exportJSON = () => download("habits.json", JSON.stringify({ habits, completions: comps, time_spent_seconds: times }, null, 2), "application/json");
  const exportCSV = () => {
    const rows = [["date", "habit", "mode", "value", "minutes"]];
    const dates = new Set([...Object.keys(comps), ...Object.keys(times)]);
    dates.forEach((d) => habits.forEach((h) => {
      const v = (comps[d] && comps[d][h.id]) || 0;
      const secs = (times[d] && times[d][h.id]) || 0;
      if (v || secs) rows.push([d, JSON.stringify(h.name), h.mode || "simple", v, Math.round(secs / 60)]);
    }));
    download("habits.csv", rows.map((r) => r.join(",")).join("\n"), "text/csv");
  };
  const card = { background: T.surface, border: `1px solid ${T.border}`, boxShadow: T.shadow };
  const Row = ({ children }) => <div className="hb-card flex items-center justify-between rounded-2xl px-4 py-3.5" style={card}>{children}</div>;
  return (
    <div className="max-w-xl mx-auto w-full">
      <h1 className="hb-display text-3xl tracking-tight mb-5" style={{ color: T.text }}>Settings</h1>
      <div className="flex flex-col gap-2.5">
        <Row>
          <div className="min-w-0">
            <p className="text-sm font-medium" style={{ color: T.text }}>Account</p>
            <p className="text-xs mt-0.5 truncate" style={{ color: T.faint }}>{(user && user.email) || "Signed in"}</p>
          </div>
          <button onClick={onSignOut} className="hb-press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold flex-shrink-0"
            style={{ background: T.surface2, color: T.text, border: `1px solid ${T.border}` }}>
            <LogOut size={13} /> Sign out
          </button>
        </Row>
        <div className="hb-card rounded-2xl px-4 py-3.5 flex flex-col gap-3" style={card}>
          <p className="text-sm font-medium" style={{ color: T.text }}>Profile</p>
          <div className="flex items-center gap-3">
            <button aria-label="Change avatar" onClick={() => setPickerOpen((p) => !p)}
              className="hb-press flex items-center justify-center rounded-full flex-shrink-0"
              style={{ width: 44, height: 44, background: avatarColor + "26", border: `2px solid ${avatarColor}77`, fontSize: 20 }}>
              {avatarEmoji}
            </button>
            <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)}
              onBlur={() => setDisplayName(nameDraft.trim())}
              onKeyDown={(e) => { if (e.key === "Enter") { e.target.blur(); } }}
              placeholder="Display name" aria-label="Display name"
              className="flex-1 min-w-0 rounded-xl px-3 py-2 text-sm outline-none"
              style={{ background: T.surface2, border: `1px solid ${T.border}`, color: T.text }} />
          </div>
          {pickerOpen && (
            <div className="hb-rise flex flex-col gap-2.5">
              <div className="flex flex-wrap gap-2">
                {AVATAR_EMOJIS.map((em) => (
                  <button key={em} aria-label={`Use ${em} as avatar`} onClick={() => setAvatarEmoji(em)}
                    className="hb-press flex items-center justify-center rounded-full"
                    style={{
                      width: 32, height: 32, fontSize: 15, background: T.surface2,
                      boxShadow: avatarEmoji === em ? `0 0 0 2px ${avatarColor}` : "none",
                    }}>{em}</button>
                ))}
              </div>
              <div className="flex flex-wrap gap-2">
                {[...ACCENTS.map((a) => a.hex), ...HABIT_COLORS.slice(0, 3)].map((c) => (
                  <button key={c} aria-label={`Use ${c} as avatar color`} onClick={() => setAvatarColor(c)}
                    className="rounded-full" style={{
                      width: 20, height: 20, background: c,
                      boxShadow: avatarColor === c ? `0 0 0 2px ${T.solid}, 0 0 0 4px ${c}` : "none",
                      transition: `all .3s ${SPRING}`,
                    }} />
                ))}
              </div>
            </div>
          )}
        </div>
        <Row>
          <span className="text-sm font-medium" style={{ color: T.text }}>Appearance</span>
          <div className="flex rounded-full p-1" style={{ background: T.surface2 }}>
            {[["dark", Moon], ["light", Sun]].map(([k, Icon]) => (
              <button key={k} aria-label={k + " mode"} aria-pressed={theme === k} onClick={() => setTheme(k)}
                className="rounded-full px-3 py-1.5"
                style={{ background: theme === k ? T.solid : "transparent", color: theme === k ? T.text : T.faint, boxShadow: theme === k ? T.shadow : "none", transition: `all .4s ${EASE}` }}>
                <Icon size={15} />
              </button>
            ))}
          </div>
        </Row>
        <Row>
          <span className="text-sm font-medium" style={{ color: T.text }}>Accent color</span>
          <div className="flex gap-2">
            {ACCENTS.map((a) => (
              <button key={a.hex} aria-label={a.name} title={a.name} onClick={() => setAccent(a.hex)}
                className="rounded-full" style={{
                  width: 26, height: 26, background: a.hex,
                  boxShadow: accent === a.hex ? `0 0 0 2px ${T.solid}, 0 0 0 4px ${a.hex}, 0 0 14px ${a.hex}99` : "none",
                  transform: accent === a.hex ? "scale(1.1)" : "scale(1)", transition: `all .3s ${SPRING}`,
                }} />
            ))}
          </div>
        </Row>
        <Row>
          <div>
            <p className="text-sm font-medium" style={{ color: T.text }}>Streak grace</p>
            <p className="text-xs mt-0.5" style={{ color: T.faint }}>One missed day won't break a streak</p>
          </div>
          <button role="switch" aria-checked={grace} onClick={() => setGrace(!grace)}
            className="relative rounded-full flex-shrink-0" style={{ width: 42, height: 25, background: grace ? accent : T.border, boxShadow: grace ? `0 0 12px ${accent}66` : "none", transition: "background .3s, box-shadow .4s" }}>
            <span className="absolute top-0.5 rounded-full bg-white" style={{ width: 21, height: 21, left: grace ? 19 : 2, transition: `left .3s ${SPRING}` }} />
          </button>
        </Row>
        <Row>
          <span className="text-sm font-medium" style={{ color: T.text }}>Export data</span>
          <div className="flex gap-2">
            {[["CSV", exportCSV], ["JSON", exportJSON]].map(([label, fn]) => (
              <button key={label} onClick={fn} className="hb-press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold"
                style={{ background: T.surface2, color: T.text, border: `1px solid ${T.border}` }}>
                <Download size={13} /> {label}
              </button>
            ))}
          </div>
        </Row>
        <p className="text-xs px-2 mt-2" style={{ color: T.faint }}>
          Your habits and history sync to your account automatically — sign in on any device to pick up where you left off.
        </p>
      </div>
    </div>
  );
}

/* ---------------- Celebration & onboarding ---------------- */
function Celebration({ data, onClose, T, accent }) {
  const isDay = data.type === "day";
  const pieces = useMemo(() => Array.from({ length: isDay ? 18 : 46 }, (_, i) => ({
    left: Math.random() * 100, delay: Math.random() * 0.7, dur: 2 + Math.random() * 1.6,
    color: [accent, ...HABIT_COLORS.slice(0, 4)][i % 5],
    size: 6 + Math.random() * 7, rot: Math.random() * 360,
  })), [accent, isDay]);
  useEffect(() => { const t = setTimeout(onClose, isDay ? 1900 : 4200); return () => clearTimeout(t); }, [isDay]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden cursor-pointer"
      style={{ background: isDay ? "transparent" : `radial-gradient(circle at 50% 40%, ${accent}30, ${T.bg}F2 75%)`, backdropFilter: isDay ? "none" : "blur(10px)", pointerEvents: isDay ? "none" : "auto" }}
      onClick={onClose} role="dialog" aria-label={isDay ? "Perfect day" : "Milestone celebration"}>
      {pieces.map((p, i) => (
        <span key={i} className="hb-confetti absolute rounded-sm" style={{
          left: p.left + "%", top: -20, width: p.size, height: p.size * 0.6, background: p.color,
          boxShadow: `0 0 8px ${p.color}AA`,
          animationDelay: p.delay + "s", animationDuration: p.dur + "s", transform: `rotate(${p.rot}deg)`,
        }} />
      ))}
      {isDay ? (
        <div className="hb-pop absolute bottom-24 md:bottom-10 flex items-center gap-2.5 rounded-full px-5 py-3"
          style={{ background: T.solid, border: `1px solid ${accent}55`, boxShadow: `0 0 0 6px ${accent}22, 0 0 40px ${accent}55, ${T.shadow}` }}>
          <span className="inline-flex items-center justify-center rounded-full" style={{ width: 26, height: 26, background: accent, boxShadow: `0 0 16px ${accent}99` }}>
            <Check size={14} color="#0A0A0F" strokeWidth={3} />
          </span>
          <span className="font-semibold text-sm" style={{ color: T.text }}>Perfect day — everything's done</span>
        </div>
      ) : (
        <div className="hb-pop text-center px-6">
          <div className="inline-flex items-center justify-center rounded-full mb-5"
            style={{ width: 88, height: 88, background: accent, boxShadow: `0 0 0 14px ${accent}22, 0 0 70px ${accent}88` }}>
            <Flame size={42} color="#0A0A0F" strokeWidth={2.2} />
          </div>
          <p className="hb-display hb-reveal text-5xl tabular-nums" style={{ color: T.text, textShadow: `0 0 40px ${accent}66` }}>{data.n}-day streak</p>
          <p className="hb-display text-xl mt-2" style={{ color: T.text }}>{data.habit.emoji} {data.habit.name}</p>
          <p className="text-sm mt-3" style={{ color: T.muted }}>
            {data.n >= 100 ? "One hundred days. This isn't a habit anymore — it's who you are." :
              data.n >= 30 ? "A full month of showing up. Quietly remarkable." :
              "Seven days straight. The hardest week is behind you."}
          </p>
        </div>
      )}
    </div>
  );
}

function Onboarding({ onDone, T, accent }) {
  const [i, setI] = useState(0);
  const slides = [
    { emoji: "🌱", title: "Small habits, kept daily", body: "Track the routines that matter with one tap. No guilt, no noise — just a calm record of showing up." },
    { emoji: "⚡", title: "Not just done — how well", body: "Quality habits get an intensity grid. Tap a day once for \"barely did it\", keep tapping up to \"crushed it\" and watch it glow." },
    { emoji: "🔥", title: "Streaks that forgive", body: "Build momentum with streaks, and turn on grace so one hard day never erases your progress." },
    { emoji: "📈", title: "See yourself clearly", body: "Beautiful, animated insights reveal your patterns — your best days, your peak-intensity moments, your comeback stories." },
  ];
  const s = slides[i];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: `radial-gradient(circle at 50% 20%, ${accent}14, ${T.bg} 60%)` }}>
      <div className="text-center max-w-sm">
        <div key={i} className="hb-pop">
          <div className="text-6xl mb-6" aria-hidden style={{ filter: `drop-shadow(0 0 24px ${accent}55)` }}>{s.emoji}</div>
          <h2 className="hb-display text-2xl mb-3" style={{ color: T.text }}>{s.title}</h2>
          <p className="text-sm leading-relaxed" style={{ color: T.muted }}>{s.body}</p>
        </div>
        <div className="flex justify-center gap-1.5 my-8">
          {slides.map((_, k) => (
            <span key={k} className="rounded-full" style={{ width: k === i ? 20 : 6, height: 6, background: k === i ? accent : T.border, boxShadow: k === i ? `0 0 8px ${accent}88` : "none", transition: `all .4s ${EASE}` }} />
          ))}
        </div>
        <button onClick={() => (i < slides.length - 1 ? setI(i + 1) : onDone())}
          className="hb-press w-full rounded-2xl py-3.5 font-semibold"
          style={{ background: accent, color: "#0A0A0F", boxShadow: `0 8px 30px -4px ${accent}88` }}>
          {i < slides.length - 1 ? "Next" : "Start tracking"}
        </button>
        {i < slides.length - 1 && <button onClick={onDone} className="mt-3 text-sm font-medium block mx-auto" style={{ color: T.faint }}>Skip</button>}
      </div>
    </div>
  );
}


/* ---------------- Progress Dashboard ---------------- */
function DashboardView({ habits, comps, setComp, T, accent, grace }) {
  const active = habits.filter((h) => !h.archived).sort((a, b) => a.order - b.order);
  const [sel, setSel] = useState("all");
  const h = sel === "all" ? null : active.find((x) => x.id === sel) || null;
  const base = h ? hColor(h) : accent;
  const [tip, setTip] = useState(null);   // { x, y, title, lines }
  const [ping, setPing] = useState(null); // { d, ts }

  const end = todayStr();
  const WEEKS = 53;
  const startW = addDays(weekStart(end), -(WEEKS - 1) * 7);
  const CELL = 14, GAP = 3;

  /* value 0..MAX_LVL for any cell under the current scope */
  const lvlFor = (d) => {
    if (h) {
      if (isQuality(h)) return Math.min(MAX_LVL, doneValue(comps, d, h.id));
      return isDone(h, comps, d) ? MAX_LVL : 0;
    }
    const sched = active.filter((x) => isScheduled(x, d));
    if (!sched.length) return 0;
    const rate = sched.filter((x) => isDone(x, comps, d)).length / sched.length;
    return rate === 0 ? 0 : Math.max(1, Math.round(rate * MAX_LVL));
  };

  const clickCell = (d) => {
    if (!h) return; // aggregate view is read-only
    setPing({ d, ts: Date.now() });
    if (isQuality(h)) setComp(d, h.id, (doneValue(comps, d, h.id) + 1) % (MAX_LVL + 1));
    else setComp(d, h.id, isDone(h, comps, d) ? 0 : (h.quant ? h.quantTarget : 1));
  };

  const showTip = (e, d) => {
    const r = e.currentTarget.getBoundingClientRect();
    const lines = [];
    if (h) {
      const lvl = lvlFor(d);
      lines.push(isQuality(h) ? `${INTENSITY_LABELS[lvl]}${lvl ? ` · ${lvl}/${MAX_LVL}` : ""}` : (isDone(h, comps, d) ? "Completed" : "Not done"));
    } else {
      const sched = active.filter((x) => isScheduled(x, d));
      const done = sched.filter((x) => isDone(x, comps, d));
      lines.push(`${done.length}/${sched.length} habits done`);
      done.slice(0, 4).forEach((x) => lines.push(`${x.emoji} ${x.name}${isQuality(x) ? ` · ${doneValue(comps, d, x.id)}/${MAX_LVL}` : ""}`));
      if (done.length > 4) lines.push(`+${done.length - 4} more`);
    }
    setTip({ x: r.left + r.width / 2, y: r.top, title: prettyDate(d), lines });
  };

  /* grid cells + month labels */
  const { cells, monthMarks } = useMemo(() => {
    const cs = [], marks = [];
    let prevM = -1;
    for (let w = 0; w < WEEKS; w++) {
      const ws = addDays(startW, w * 7);
      const m = parse(ws).getMonth();
      if (m !== prevM) { marks.push({ w, label: MONTHS[m] }); prevM = m; }
      for (let r = 0; r < 7; r++) cs.push(addDays(ws, r));
    }
    return { cells: cs, monthMarks: marks };
  }, [startW]);

  /* pinned aggregate stats over the visible year */
  const stats = useMemo(() => {
    let activeDays = 0, points = 0, possibleDays = 0;
    let d = startW;
    while (d <= end) {
      const lvl = lvlFor(d);
      if (lvl > 0) { activeDays++; points += h && isQuality(h) ? doneValue(comps, d, h.id) : (h ? 1 : active.filter((x) => isScheduled(x, d) && isDone(x, comps, d)).length); }
      possibleDays++;
      d = addDays(d, 1);
    }
    const streaks = h ? [calcStreak(h, comps, grace)] : active.map((x) => calcStreak(x, comps, grace));
    const cur = Math.max(0, ...streaks.map((s) => (s.unit === "day" ? s.current : 0)));
    const max = Math.max(0, ...streaks.map((s) => (s.unit === "day" ? s.longest : 0)));
    const avgInt = h && isQuality(h) ? avgIntensity(h, comps, startW, end) : null;
    return { activeDays, points, possibleDays, cur, max, avgInt };
  }, [comps, sel, habits, grace]);

  const s1 = useCountUp(stats.activeDays), s2 = useCountUp(stats.points), s3 = useCountUp(stats.max);

  /* insight cards */
  const insights = useMemo(() => {
    const out = [];
    // best month
    const byMonth = {};
    let d = startW;
    while (d <= end) { const k = d.slice(0, 7); (byMonth[k] = byMonth[k] || []).push(lvlFor(d)); d = addDays(d, 1); }
    let bk = null, bv = -1;
    Object.entries(byMonth).forEach(([k, v]) => { if (v.length >= 15) { const a = v.reduce((x, y) => x + y, 0) / v.length; if (a > bv) { bv = a; bk = k; } } });
    if (bk) out.push({ icon: Sparkles, label: "Peak month", value: MONTHS[+bk.slice(5) - 1], sub: `avg ${bv.toFixed(1)}/${MAX_LVL} per day` });
    // top weekday
    const byWd = Array(7).fill(0).map(() => ({ s: 0, n: 0 }));
    d = startW;
    while (d <= end) { byWd[dow(d)].s += lvlFor(d); byWd[dow(d)].n++; d = addDays(d, 1); }
    let wi = 0, wv = 0;
    byWd.forEach((x, i) => { const a = x.n ? x.s / x.n : 0; if (a > wv) { wv = a; wi = i; } });
    out.push({ icon: Zap, label: "Strongest day", value: DOW_SHORT[wi] + "days", sub: `avg ${wv.toFixed(1)}/${MAX_LVL}` });
    // momentum: last 30 vs prior 30
    const avgOf = (a, b) => { let s = 0, n = 0, x = a; while (x <= b) { s += lvlFor(x); n++; x = addDays(x, 1); } return n ? s / n : 0; };
    const recent = avgOf(addDays(end, -29), end), prior = avgOf(addDays(end, -59), addDays(end, -30));
    const delta = prior ? Math.round(((recent - prior) / prior) * 100) : 0;
    out.push({
      icon: delta >= 0 ? TrendingUp : TrendingDown, label: "Momentum",
      value: `${delta >= 0 ? "+" : ""}${delta}%`, sub: "last 30 days vs the 30 before",
      good: delta >= 0,
    });
    return out;
  }, [comps, sel, habits]);

  const card = { background: T.surface, border: `1px solid ${T.border}`, boxShadow: T.shadow };

  return (
    <div className="max-w-5xl mx-auto w-full" onMouseLeave={() => setTip(null)}>
      <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
        <div>
          <p className="text-sm font-medium" style={{ color: T.muted }}>The year, one square at a time</p>
          <h1 className="hb-display text-3xl tracking-tight" style={{ color: T.text }}>Progress</h1>
        </div>
        {h && (
          <p className="text-xs" style={{ color: T.faint }}>
            {isQuality(h) ? "Click any day to cycle its intensity 0–" + MAX_LVL : "Click any day to toggle it"}
          </p>
        )}
      </div>

      {/* pinned aggregate stats */}
      <div className="sticky top-2 z-20 mb-4">
        <div key={sel} className="hb-reveal grid grid-cols-2 sm:grid-cols-4 gap-2 rounded-3xl p-3"
          style={{ background: T.nav, border: `1px solid ${T.border}`, backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", boxShadow: T.shadow }}>
          {[
            [Math.round(s1), "active days"],
            [Math.round(s2), h && isQuality(h) ? "intensity points" : "checks logged"],
            [stats.cur, "current streak", true],
            [Math.round(s3), "max streak"],
          ].map(([v, l, flame]) => (
            <div key={l} className="rounded-2xl px-3 py-2">
              <p className="hb-display text-xl sm:text-2xl tabular-nums flex items-center gap-1.5" style={{ color: T.text }}>
                {flame && stats.cur > 0 && <Flame size={16} style={{ color: base, filter: `drop-shadow(0 0 5px ${base}88)` }} />}{v}
                {l === "active days" && <span className="text-xs font-medium" style={{ color: T.faint }}>/ {stats.possibleDays}</span>}
              </p>
              <p className="text-[11px]" style={{ color: T.faint }}>{l}{stats.avgInt != null && l === "intensity points" ? ` · avg ${stats.avgInt.toFixed(1)}` : ""}</p>
            </div>
          ))}
        </div>
      </div>

      {/* scope selector */}
      <div className="flex gap-1.5 overflow-x-auto hb-scroll pb-2 mb-3">
        {[{ id: "all", name: "All habits", emoji: "◎" }, ...active].map((x) => {
          const on = sel === (x.id || "all");
          const c = x.id === "all" ? accent : hColor(x);
          return (
            <button key={x.id} onClick={() => { setSel(x.id); setTip(null); }}
              className="hb-press flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold whitespace-nowrap flex-shrink-0"
              style={{
                background: on ? c + "22" : T.surface, color: on ? c : T.muted,
                border: `1px solid ${on ? c : T.border}`,
                boxShadow: on ? `0 0 16px -4px ${c}88` : "none",
                transition: `all .3s ${EASE}`,
              }}>
              <span aria-hidden>{x.emoji}</span>{x.name}{x.id !== "all" && isQuality(x) && <Zap size={11} />}
            </button>
          );
        })}
      </div>

      {/* the year grid */}
      <div key={sel} className="hb-card hb-reveal relative rounded-3xl p-5 mb-4 overflow-hidden"
        style={{ ...card, "--glow-border": base + "40", "--glow-shadow": `0 0 0 1px ${base}26, 0 10px 50px -10px ${base}30, ${T.shadow}` }}>
        <div aria-hidden className="absolute pointer-events-none" style={{ inset: -60, background: `radial-gradient(circle at 12% 0%, ${base}1A, transparent 50%)` }} />
        <div className="relative overflow-x-auto hb-scroll pb-1">
          <div style={{ width: "max-content" }}>
            {/* month labels */}
            <div className="relative mb-1.5" style={{ height: 14, marginLeft: 30 }}>
              {monthMarks.map((m, i) => (
                <span key={i} className="absolute text-[10px] font-semibold uppercase tracking-wider"
                  style={{ left: m.w * (CELL + GAP), color: T.faint }}>{m.label}</span>
              ))}
            </div>
            <div className="flex">
              {/* weekday gutter */}
              <div className="grid mr-2" style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, gap: GAP, width: 22 }}>
                {DOW_SHORT.map((d, i) => (
                  <span key={d} className="text-[9px] font-semibold text-right leading-none flex items-center justify-end"
                    style={{ color: i % 2 === 1 ? T.faint : "transparent" }}>{d}</span>
                ))}
              </div>
              <div className="grid grid-flow-col" style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, gap: GAP }}>
                {cells.map((d, i) => {
                  const future = d > end;
                  const lvl = future ? 0 : lvlFor(d);
                  return (
                    <button key={d} disabled={future || !h}
                      aria-label={future ? undefined : `${prettyDate(d)}: ${INTENSITY_LABELS[lvl]}`}
                      onClick={() => clickCell(d)}
                      onMouseEnter={(e) => !future && showTip(e, d)}
                      onFocus={(e) => !future && showTip(e, d)}
                      onMouseLeave={() => setTip(null)}
                      onBlur={() => setTip(null)}
                      className="hb-cell relative rounded-[4px] outline-none"
                      style={{
                        width: CELL, height: CELL,
                        ...(future ? { background: "transparent" } : cellStyle(base, lvl, T)),
                        opacity: future ? 0 : 1,
                        cursor: h && !future ? "pointer" : "default",
                        outline: d === end ? `1.5px solid ${base}AA` : "none", outlineOffset: 1.5,
                        animation: `hbFade .45s ${Math.min(i * 1.5, 520)}ms both`,
                      }}>
                      {ping && ping.d === d && <span key={ping.ts} className="hb-ping" style={{ "--pc": base + "88" }} />}
                    </button>
                  );
                })}
              </div>
            </div>
            {/* legend */}
            <div className="flex items-center gap-1.5 mt-3" style={{ marginLeft: 30 }}>
              <span className="text-[10px]" style={{ color: T.faint }}>less</span>
              {Array.from({ length: MAX_LVL + 1 }, (_, l) => (
                <span key={l} className="rounded-[3px]" style={{ width: 10, height: 10, ...cellStyle(base, l, T) }} />
              ))}
              <span className="text-[10px]" style={{ color: T.faint }}>more</span>
              {!h && <span className="text-[10px] ml-3" style={{ color: T.faint }}>· showing all habits combined — pick one above to edit days</span>}
            </div>
          </div>
        </div>
      </div>

      {/* insight cards */}
      <div key={sel + "i"} className="grid sm:grid-cols-3 gap-3">
        {insights.map((c, i) => (
          <div key={c.label} className="hb-rise hb-card rounded-3xl p-4 relative overflow-hidden"
            style={{ ...card, animationDelay: `${i * 70}ms`, "--glow-border": base + "38", "--glow-shadow": `0 0 0 1px ${base}22, 0 6px 30px -8px ${base}2E, ${T.shadow}` }}>
            <div aria-hidden className="absolute pointer-events-none" style={{ inset: -40, background: `radial-gradient(circle at 85% 0%, ${base}14, transparent 55%)` }} />
            <div className="relative">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: T.faint }}>
                <c.icon size={12} style={{ color: c.good === false ? "#FF7A7A" : base }} /> {c.label}
              </p>
              <p className="hb-display text-2xl" style={{ color: c.good === false ? "#FF9A9A" : T.text }}>{c.value}</p>
              <p className="text-xs mt-0.5" style={{ color: T.muted }}>{c.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {/* floating tooltip */}
      {tip && (
        <div className="fixed z-50 pointer-events-none px-3 py-2 rounded-xl text-xs"
          style={{
            left: tip.x, top: tip.y - 8, transform: "translate(-50%, -100%)",
            background: T.solid, border: `1px solid ${T.border}`, boxShadow: T.shadow, color: T.text,
            backdropFilter: "blur(14px)", maxWidth: 230,
          }}>
          <p className="font-semibold mb-0.5">{tip.title}</p>
          {tip.lines.map((l, i) => <p key={i} style={{ color: i === 0 ? T.muted : T.faint }}>{l}</p>)}
        </div>
      )}
    </div>
  );
}

/* ---------------- App shell ---------------- */
const NAV = [
  { key: "today", label: "Today", icon: ListChecks },
  { key: "habits", label: "Habits", icon: CalendarDays },
  { key: "analysis", label: "Analysis", icon: BarChart3 },
  { key: "dashboard", label: "Progress", icon: LayoutGrid },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

const GRAIN = "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.5'/%3E%3C/svg%3E\")";

export default function HabitTracker({ user, onSignOut }) {
  const [habits, setHabits] = useState([]);
  const [comps, setComps] = useState({});
  const [times, setTimes] = useState({});
  const [loading, setLoading] = useState(true);
  const [dbError, setDbError] = useState(null);
  const [view, setView] = useState("today");
  const [date, setDate] = useState(todayStr());
  const initialProfile = useRef(getProfile(user)).current;
  const [theme, setThemeState] = useState(initialProfile.theme || "dark");
  const [accent, setAccentState] = useState(initialProfile.accent || ACCENTS[0].hex);
  const [displayName, setDisplayNameState] = useState(initialProfile.displayName || "");
  const [avatarEmoji, setAvatarEmojiState] = useState(initialProfile.avatarEmoji || AVATAR_EMOJIS[0]);
  const [avatarColor, setAvatarColorState] = useState(initialProfile.avatarColor || ACCENTS[0].hex);
  const [grace, setGrace] = useState(false);
  const [onboard, setOnboard] = useState(false);
  const [celebrate, setCelebrate] = useState(null);
  const cfgRef = useRef({});
  const profileRef = useRef(initialProfile);
  const T = THEMES[theme];

  const saveProfilePatch = (patch) => {
    const next = { ...profileRef.current, ...patch };
    profileRef.current = next;
    saveProfile(next).catch((e) => fail(e, "Couldn't save your profile"));
  };
  const setTheme = (v) => { setThemeState(v); saveProfilePatch({ theme: v }); };
  const setAccent = (v) => { setAccentState(v); saveProfilePatch({ accent: v }); };
  const setDisplayName = (v) => { setDisplayNameState(v); saveProfilePatch({ displayName: v }); };
  const setAvatarEmoji = (v) => { setAvatarEmojiState(v); saveProfilePatch({ avatarEmoji: v }); };
  const setAvatarColor = (v) => { setAvatarColorState(v); saveProfilePatch({ avatarColor: v }); };

  const fail = (e, what) => { console.error(what, e); setDbError(`${what} — ${(e && e.message) || "check your connection"}`); };

  /* ---- initial load, scoped to the signed-in user by RLS ---- */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const cfg = getConfig(user);
        cfgRef.current = cfg;
        const [rows, entries] = await Promise.all([fetchHabits(), fetchEntries(400)]);
        if (!alive) return;
        const hs = rows.map((r, i) => rowToHabit(r, cfg[r.id], i));
        const byId = Object.fromEntries(hs.map((h) => [h.id, h]));
        const c = {}, t = {};
        entries.forEach((e) => {
          const h = byId[e.habit_id];
          if (!h) return;
          const meta = parseNotes(e.notes);
          let v = 0;
          if (isQuality(h)) v = meta.lvl != null ? meta.lvl : (e.completed ? 3 : 0);
          else if (h.quant) v = meta.qty != null ? meta.qty : (e.completed ? h.quantTarget : 0);
          else v = e.completed ? 1 : 0;
          if (v) (c[e.date] = c[e.date] || {})[h.id] = v;
          if (e.time_spent_seconds) (t[e.date] = t[e.date] || {})[h.id] = e.time_spent_seconds;
        });
        setHabits(hs); setComps(c); setTimes(t);
        if (rows.length === 0) setOnboard(true);
      } catch (e) { fail(e, "Couldn't load your data"); }
      finally { if (alive) setLoading(false); }
    })();
    return () => { alive = false; };
  }, [user.id]);

  const saveCfg = (mutate) => {
    const next = JSON.parse(JSON.stringify(cfgRef.current));
    mutate(next);
    cfgRef.current = next;
    saveConfig(next).catch((e) => fail(e, "Couldn't save habit settings"));
  };

  /* ---- completion writes: optimistic local update + upsert ---- */
  const entryPayload = (h, d, value) => ({
    habit_id: h.id, user_id: user.id, date: d,
    completed: value >= (h.quant ? h.quantTarget : 1),
    notes: isQuality(h) ? JSON.stringify({ lvl: value }) : h.quant ? JSON.stringify({ qty: value }) : null,
  });

  const setComp = (d, id, value) => {
    const h = habits.find((x) => x.id === id);
    if (!h) return;
    setComps((p) => {
      const next = { ...p, [d]: { ...(p[d] || {}), [id]: value } };
      if (value >= (h.quant ? h.quantTarget : 1) && d === todayStr()) {
        const wasDone = doneValue(p, d, id) >= (h.quant ? h.quantTarget : 1);
        if (!wasDone) {
          const s = calcStreak(h, next, grace);
          if ([7, 30, 100].includes(s.current) && s.unit === "day") {
            setCelebrate({ type: "streak", habit: h, n: s.current });
          } else {
            const before = dayProgress(habits, p, d);
            const after = dayProgress(habits, next, d);
            if (after.total > 0 && after.done === after.total && !(before.total > 0 && before.done === before.total)) {
              setCelebrate({ type: "day" });
            }
          }
        }
      }
      return next;
    });
    upsertEntry(entryPayload(h, d, value)).catch((e) => fail(e, "Couldn't save that check"));
  };

  /* ---- time tracking ---- */
  const addSeconds = (d, id, secs) => {
    if (!secs || secs < 1) return;
    const h = habits.find((x) => x.id === id);
    if (!h) return;
    const total = Math.round(((times[d] && times[d][id]) || 0) + secs);
    setTimes((p) => ({ ...p, [d]: { ...(p[d] || {}), [id]: total } }));
    upsertEntry({ ...entryPayload(h, d, doneValue(comps, d, id)), time_spent_seconds: total })
      .catch((e) => fail(e, "Couldn't save time"));
  };

  const [timer, setTimer] = useState(() => {
    try { return JSON.parse(localStorage.getItem("kept_timer")) || null; } catch { return null; }
  });
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    try {
      if (timer) localStorage.setItem("kept_timer", JSON.stringify(timer));
      else localStorage.removeItem("kept_timer");
    } catch {}
  }, [timer]);
  useEffect(() => {
    if (!timer || !timer.running) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [timer && timer.running]);

  const stopTimer = () => {
    const t = timer;
    if (!t) return;
    const total = t.acc + (t.running ? (Date.now() - t.startedAt) / 1000 : 0);
    addSeconds(t.date, t.habitId, total);
    setTimer(null);
  };
  const timeCtxValue = {
    times, timer, now,
    startTimer: (h) => {
      if (timer) stopTimer(); // one active timer at a time — bank the old one first
      setTimer({ habitId: h.id, date: todayStr(), startedAt: Date.now(), acc: 0, running: true });
      setNow(Date.now());
    },
    pauseTimer: () => setTimer((t) => t && { ...t, acc: t.acc + (Date.now() - t.startedAt) / 1000, running: false }),
    resumeTimer: () => { setTimer((t) => t && { ...t, startedAt: Date.now(), running: true }); setNow(Date.now()); },
    stopTimer,
    addMinutes: (d, id, mins) => addSeconds(d, id, mins * 60),
  };

  /* ---- habit CRUD against Supabase ---- */
  const rowFields = (h) => ({
    name: h.name, category: h.category, icon: h.emoji,
    target: h.type === "tpw" ? (h.target || 3) : h.quant ? (h.quantTarget || 1) : 1,
  });
  const extras = (h, order) => ({
    mode: h.mode || "simple", color: h.color || null, type: h.type || "daily", days: h.days || [],
    quant: !!h.quant, quantTarget: h.quantTarget || 1, unit: h.unit || "", desc: h.desc || "",
    target: h.target || 3, archived: !!h.archived, order,
  });
  const create = async (h) => {
    try {
      const row = await insertHabit(user.id, rowFields(h));
      const order = habits.length;
      saveCfg((c) => { c[row.id] = extras(h, order); });
      setHabits((p) => [...p, { ...h, id: row.id, archived: false, order: p.length }]);
    } catch (e) { fail(e, "Couldn't create habit"); }
  };
  const habitActions = {
    create,
    update: async (id, h) => {
      try {
        await updateHabitRow(id, rowFields(h));
        const old = habits.find((x) => x.id === id) || {};
        saveCfg((c) => { c[id] = extras({ ...old, ...h }, old.order != null ? old.order : 0); });
        setHabits((p) => p.map((x) => (x.id === id ? { ...x, ...h } : x)));
      } catch (e) { fail(e, "Couldn't update habit"); }
    },
    archive: (id) => {
      saveCfg((c) => { c[id] = { ...(c[id] || {}), archived: true }; });
      setHabits((p) => p.map((x) => (x.id === id ? { ...x, archived: true } : x)));
    },
    restore: (id) => {
      saveCfg((c) => { c[id] = { ...(c[id] || {}), archived: false }; });
      setHabits((p) => p.map((x) => (x.id === id ? { ...x, archived: false } : x)));
    },
    remove: async (id) => {
      try {
        await deleteHabitCascade(id);
        saveCfg((c) => { delete c[id]; });
        setHabits((p) => p.filter((x) => x.id !== id));
      } catch (e) { fail(e, "Couldn't delete habit"); }
    },
    reorder: (ids) => {
      saveCfg((c) => ids.forEach((id, i) => { c[id] = { ...(c[id] || {}), order: i }; }));
      setHabits((p) => p.map((x) => (ids.includes(x.id) ? { ...x, order: ids.indexOf(x.id) } : x)));
    },
  };
  const quickAdd = (name) => create({
    name, emoji: "\u2728", desc: "", category: "Health", type: "daily", mode: "simple", color: null,
    days: [], target: 3, quant: false, quantTarget: 1, unit: "",
  });
  const addStarterHabits = async () => { for (const h of STARTER_HABITS) await create(h); };

  const orbColors = [accent, "#4ADE80", "#B48CFF"];

  return (
    <TimeCtx.Provider value={timeCtxValue}>
    <div className="min-h-screen w-full relative" style={{ background: T.bg, color: T.text, transition: "background .55s ease, color .55s ease", fontFamily: "'Inter', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
        .hb-display { font-weight: 700; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; }
        .tabular-nums { font-variant-numeric: tabular-nums; }

        /* --- motion vocabulary --- */
        @keyframes hbRise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
        .hb-rise { animation: hbRise .5s ${EASE} both; }
        @keyframes hbFade { from { opacity: 0; } to { opacity: 1; } }
        @keyframes hbPop { 0% { opacity: 0; transform: scale(.85) translateY(14px); } 100% { opacity: 1; transform: none; } }
        .hb-pop { animation: hbPop .55s ${SPRING} both; }
        @keyframes hbSlide { from { opacity: 0; transform: translateX(16px); } to { opacity: 1; transform: none; } }
        .hb-slide { animation: hbSlide .45s ${EASE} both; }
        @keyframes hbModal { from { opacity: 0; transform: translateY(28px) scale(.97); } to { opacity: 1; transform: none; } }
        .hb-modal { animation: hbModal .4s ${EASE} both; }
        @keyframes hbGlow { 0% { opacity: .55; transform: scale(1); } 100% { opacity: 0; transform: scale(2.4); } }
        .hb-glow { position: absolute; inset: 0; border-radius: 9999px; animation: hbGlow .5s ease-out forwards; pointer-events: none; }
        @keyframes hbConfetti { 0% { transform: translateY(0) rotate(0deg); opacity: 1; } 100% { transform: translateY(105vh) rotate(560deg); opacity: .6; } }
        .hb-confetti { animation-name: hbConfetti; animation-timing-function: cubic-bezier(.3,.6,.6,1); animation-fill-mode: both; }
        @keyframes hbReveal { from { filter: blur(7px); opacity: .25; } to { filter: blur(0); opacity: 1; } }
        .hb-reveal { animation: hbReveal .7s ${EASE} both; }

        /* --- futuristic layer --- */
        .hb-card { backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px); transition: box-shadow .45s ${EASE}, border-color .45s ${EASE}, transform .45s ${EASE}; }
        .hb-card:hover { border-color: var(--glow-border, ${accent}40) !important; box-shadow: var(--glow-shadow, 0 0 0 1px ${accent}26); }
        .hb-press { transition: transform .2s ${SPRING}; }
        .hb-press:active { transform: scale(.94); }
        .hb-cell { transition: background .35s ${EASE}, box-shadow .35s ${EASE}, transform .2s ${SPRING}, opacity .3s; }
        .hb-cell:active { transform: scale(1.25); }
        .hb-cell:hover { transform: scale(1.15); }
        @keyframes hbPing { 0% { box-shadow: 0 0 0 0 var(--pc); opacity: 1; } 100% { box-shadow: 0 0 0 12px transparent; opacity: 0; } }
        .hb-ping { position: absolute; inset: 0; border-radius: 5px; pointer-events: none; animation: hbPing .6s cubic-bezier(.22,1,.36,1) forwards; }
        .hb-glowline .recharts-area-curve { filter: drop-shadow(0 0 6px var(--gl, transparent)); }
        @keyframes hbDrift { 0% { transform: translate(0,0) scale(1); } 100% { transform: translate(60px, -40px) scale(1.15); } }
        .hb-orb { position: absolute; width: 460px; height: 460px; border-radius: 50%; filter: blur(120px); opacity: .13; animation: hbDrift 26s ease-in-out infinite alternate; }
        .hb-scroll::-webkit-scrollbar { height: 6px; width: 6px; }
        .hb-scroll::-webkit-scrollbar-thumb { background: ${accent}44; border-radius: 3px; }

        button { cursor: pointer; }
        button:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid ${accent}; outline-offset: 2px; }
        input[type="date"]::-webkit-calendar-picker-indicator { cursor: pointer; }
        select { appearance: auto; }
        @media (prefers-reduced-motion: reduce) {
          .hb-rise, .hb-pop, .hb-slide, .hb-modal, .hb-confetti, .hb-reveal, .hb-orb, .hb-ping { animation: none !important; }
          * { transition-duration: .01ms !important; }
        }
      `}</style>

      {/* ambient background: drifting gradient orbs + grain, behind everything */}
      <div aria-hidden className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        {orbColors.map((c, i) => (
          <span key={i} className="hb-orb" style={{
            background: c,
            top: ["-12%", "55%", "20%"][i], left: ["-8%", "70%", "45%"][i],
            animationDuration: `${22 + i * 7}s`, animationDelay: `${-i * 6}s`,
            opacity: theme === "dark" ? 0.13 : 0.1,
          }} />
        ))}
        <div className="absolute inset-0" style={{ backgroundImage: GRAIN, opacity: theme === "dark" ? 0.04 : 0.03, mixBlendMode: "overlay" }} />
      </div>

      {onboard && <Onboarding onDone={() => setOnboard(false)} T={T} accent={accent} />}
      {celebrate && <Celebration data={celebrate} onClose={() => setCelebrate(null)} T={T} accent={accent} />}

      <div className="flex min-h-screen relative" style={{ zIndex: 1 }}>
        {/* desktop sidebar */}
        <nav className="hidden md:flex flex-col gap-1 p-4 w-52 flex-shrink-0 sticky top-0 h-screen" aria-label="Main">
          <div className="flex items-center gap-2 px-3 py-4 mb-2">
            <span className="flex items-center justify-center rounded-xl" style={{ width: 30, height: 30, background: accent, boxShadow: `0 0 18px ${accent}77` }}>
              <Check size={16} color="#0A0A0F" strokeWidth={3} />
            </span>
            <span className="hb-display text-lg" style={{ color: T.text }}>Kept</span>
          </div>
          <button onClick={() => setView("settings")}
            className="hb-press flex items-center gap-2.5 rounded-xl px-3 py-2 mb-2 text-left"
            style={{ background: view === "settings" ? T.surface : "transparent", border: `1px solid ${view === "settings" ? T.border : "transparent"}` }}>
            <span className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 28, height: 28, background: avatarColor + "26", border: `1px solid ${avatarColor}55`, fontSize: 14 }}>
              {avatarEmoji}
            </span>
            <span className="text-sm font-medium truncate" style={{ color: T.text }}>{displayName || user.email}</span>
          </button>
          {NAV.map(({ key, label, icon: Icon }) => (
            <button key={key} onClick={() => setView(key)} aria-current={view === key ? "page" : undefined}
              className="hb-press flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-left"
              style={{
                background: view === key ? T.surface : "transparent",
                color: view === key ? T.text : T.muted,
                boxShadow: view === key ? `inset 0 0 0 1px ${accent}30, 0 4px 20px -6px ${accent}33` : "none",
                border: `1px solid ${view === key ? T.border : "transparent"}`,
                transition: `all .35s ${EASE}`,
              }}>
              <Icon size={17} style={{ color: view === key ? accent : T.faint, filter: view === key ? `drop-shadow(0 0 5px ${accent}88)` : "none" }} /> {label}
            </button>
          ))}
        </nav>

        <main className="flex-1 px-4 sm:px-8 pt-6 sm:pt-10 pb-28 md:pb-12">
          {view === "today" && <TodayView habits={habits} comps={comps} setComp={setComp} date={date} setDate={setDate} T={T} accent={accent} grace={grace} onQuickAdd={quickAdd} onStarter={addStarterHabits} onArchive={habitActions.archive} />}
          {view === "habits" && <HabitsView habits={habits} actions={habitActions} comps={comps} T={T} accent={accent} grace={grace} />}
          {view === "analysis" && <AnalysisView habits={habits} comps={comps} times={times} T={T} accent={accent} grace={grace} />}
          {view === "dashboard" && <DashboardView habits={habits} comps={comps} setComp={setComp} T={T} accent={accent} grace={grace} />}
          {view === "settings" && <SettingsView theme={theme} setTheme={setTheme} accent={accent} setAccent={setAccent} grace={grace} setGrace={setGrace} habits={habits} comps={comps} times={times} T={T} user={user} onSignOut={onSignOut}
            displayName={displayName} setDisplayName={setDisplayName} avatarEmoji={avatarEmoji} setAvatarEmoji={setAvatarEmoji} avatarColor={avatarColor} setAvatarColor={setAvatarColor} />}
        </main>
      </div>

      {/* mobile bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 flex justify-around px-2 pt-2 pb-4 z-40"
        style={{ background: T.nav, backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", borderTop: `1px solid ${T.border}` }} aria-label="Main">
        {NAV.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setView(key)} aria-current={view === key ? "page" : undefined}
            className="hb-press flex flex-col items-center gap-0.5 rounded-xl px-4 py-1.5 text-[10px] font-semibold"
            style={{ color: view === key ? accent : T.faint, transition: "color .3s", filter: view === key ? `drop-shadow(0 0 6px ${accent}66)` : "none" }}>
            <Icon size={20} strokeWidth={view === key ? 2.4 : 2} />
            {label}
          </button>
        ))}
      </nav>

      {loading && <Splash T={T} accent={accent} />}
      {dbError && <ErrorToast msg={dbError} onClose={() => setDbError(null)} T={T} />}
    </div>
    </TimeCtx.Provider>
  );
}
