"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readAvailabilityAction, setAvailabilityAction } from "@/app/actions";
import { daysInRange, slotStartMinutes, type SessionWindow } from "@/lib/slots";
import { minutesToTime } from "@/lib/time";

const POLL_MS = 3500;

export type GridWindow = {
  dateRangeStartIso: string;
  dateRangeEndIso: string;
  dailyStartMinutes: number;
  dailyEndMinutes: number;
};

/** Cream through maroon: five steps of "how many people are free here". */
function heatStyle(count: number, total: number): React.CSSProperties {
  if (count === 0) return { backgroundColor: "transparent" };
  const share = total > 0 ? count / total : 0;
  // Interpolating opacity of maroon over the cream page keeps the palette to
  // the five brand colours rather than inventing new ones.
  return { backgroundColor: `rgba(139, 9, 9, ${(0.16 + share * 0.74).toFixed(3)})` };
}

export function AvailabilityGrid({
  sessionId,
  window: win,
  locked,
  onIdentityLost,
}: {
  sessionId: string;
  window: GridWindow;
  locked: boolean;
  /** Called when the server no longer recognises this browser as a participant. */
  onIdentityLost: () => void;
}) {
  const model: SessionWindow = useMemo(
    () => ({
      dateRangeStart: new Date(win.dateRangeStartIso),
      dateRangeEnd: new Date(win.dateRangeEndIso),
      dailyStartMinutes: win.dailyStartMinutes,
      dailyEndMinutes: win.dailyEndMinutes,
    }),
    [win],
  );

  const days = useMemo(() => daysInRange(model), [model]);
  const minutes = useMemo(() => slotStartMinutes(model), [model]);

  const [mine, setMine] = useState<Set<string>>(new Set());
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [total, setTotal] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // A drag in progress: whether it is painting or erasing, and what it touched.
  const drag = useRef<{ mode: "add" | "remove"; touched: Set<string> } | null>(null);
  const saving = useRef(false);

  const refresh = useCallback(async () => {
    const snap = await readAvailabilityAction(sessionId);
    if (!snap) {
      // The signed cookie is gone or was issued for another session, so this
      // device is not who localStorage thinks it is. Send it back to the join
      // form rather than showing a grid it cannot write to.
      onIdentityLost();
      return;
    }
    setCounts(new Map(snap.counts));
    setMine(new Set(snap.mine));
    setTotal(snap.participantCount);
    setLoaded(true);
  }, [sessionId, onIdentityLost]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // SPEC.md: poll while the page is open instead of running a realtime service.
  useEffect(() => {
    const id = setInterval(() => {
      // Never overwrite a selection the user is still drawing or saving.
      if (drag.current || saving.current || document.hidden) return;
      void refresh();
    }, POLL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const applyLocally = useCallback((iso: string, mode: "add" | "remove") => {
    setMine((prev) => {
      if (mode === "add" ? prev.has(iso) : !prev.has(iso)) return prev;
      const next = new Set(prev);
      if (mode === "add") next.add(iso);
      else next.delete(iso);
      return next;
    });
    setCounts((prev) => {
      const next = new Map(prev);
      const cur = next.get(iso) ?? 0;
      next.set(iso, Math.max(0, cur + (mode === "add" ? 1 : -1)));
      return next;
    });
  }, []);

  const paint = useCallback(
    (iso: string) => {
      const d = drag.current;
      if (!d || d.touched.has(iso)) return;
      d.touched.add(iso);
      applyLocally(iso, d.mode);
    },
    [applyLocally],
  );

  function beginDrag(iso: string) {
    if (locked) return;
    const mode: "add" | "remove" = mine.has(iso) ? "remove" : "add";
    drag.current = { mode, touched: new Set() };
    paint(iso);
  }

  const endDrag = useCallback(async () => {
    const d = drag.current;
    drag.current = null;
    if (!d || d.touched.size === 0) return;

    const slots = [...d.touched];
    saving.current = true;
    setError(null);
    try {
      const result = await setAvailabilityAction(
        sessionId,
        d.mode === "add" ? slots : [],
        d.mode === "remove" ? slots : [],
      );
      if (!result.ok) {
        setError(
          result.reason === "session_finalized"
            ? "This plan has been finalised, so availability is locked."
            : result.reason === "not_a_participant"
              ? "This device is no longer signed in to this plan."
              : "That change could not be saved. Reloading the grid.",
        );
      }
    } finally {
      saving.current = false;
      await refresh();
    }
  }, [sessionId, refresh]);

  /**
   * Browsers throttle timers in a background tab to roughly once a minute, so
   * a tab left open can be well behind by the time someone looks at it again.
   * Refreshing the moment it becomes visible closes that gap.
   */
  useEffect(() => {
    const onVisible = () => {
      if (document.hidden || drag.current || saving.current) return;
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [refresh]);

  // A drag can end anywhere, including outside the grid.
  useEffect(() => {
    const up = () => void endDrag();
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [endDrag]);

  /**
   * Touch drags keep firing at the element where the finger went down, so
   * pointerenter never arrives for later cells. Hit-testing the point under the
   * pointer is what makes painting work on a phone as well as a mouse.
   */
  function onPointerMove(e: React.PointerEvent) {
    if (!drag.current) return;
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const iso = el?.getAttribute?.("data-slot");
    if (iso) paint(iso);
  }

  const dayLabel = (d: Date) =>
    d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  const dayNumber = (d: Date) =>
    d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

  const best = useMemo(() => {
    let top = 0;
    for (const n of counts.values()) top = Math.max(top, n);
    return top;
  }, [counts]);

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-2xl">When are you free</h2>
        <p className="text-xs uppercase tracking-[0.09em] text-umber">
          {locked
            ? "Locked"
            : total > 0
              ? `${best} of ${total} free at best`
              : "Drag to paint"}
        </p>
      </div>

      <p className="mt-2 text-sm text-umber">
        {locked
          ? "The plan is settled, so the grid is read-only."
          : "Drag across the grid to mark when you can make it. Drag over your own marks again to clear them."}
      </p>

      {error ? (
        <p className="mt-4 rounded-md border border-maroon/25 px-3.5 py-2.5 text-sm text-maroon" role="status">
          {error}
        </p>
      ) : null}

      <div className="mt-6 overflow-x-auto">
        <div
          className="min-w-fit select-none"
          style={{ touchAction: "none" }}
          onPointerMove={onPointerMove}
        >
          {/* Day headings */}
          <div className="flex">
            <div className="w-14 shrink-0" />
            {days.map((d) => (
              <div key={d.toISOString()} className="w-16 shrink-0 px-0.5 text-center">
                <div className="text-[0.65rem] uppercase tracking-[0.08em] text-umber">
                  {dayLabel(d)}
                </div>
                <div className="text-xs text-ink">{dayNumber(d)}</div>
              </div>
            ))}
          </div>

          {/* Slot rows */}
          <div className="mt-2 border-t border-rule">
            {minutes.map((m) => (
              <div key={m} className="flex items-stretch">
                <div className="w-14 shrink-0 pr-2 text-right">
                  {m % 60 === 0 ? (
                    <span className="font-mono text-[0.65rem] text-umber">
                      {minutesToTime(m)}
                    </span>
                  ) : null}
                </div>
                {days.map((d) => {
                  const iso = new Date(d.getTime() + m * 60000).toISOString();
                  const count = counts.get(iso) ?? 0;
                  const isMine = mine.has(iso);
                  return (
                    <div key={iso} className="w-16 shrink-0 px-0.5">
                      <div
                        data-slot={iso}
                        role="button"
                        aria-pressed={isMine}
                        aria-label={`${dayNumber(d)} ${minutesToTime(m)}, ${count} free${isMine ? ", you are free" : ""}`}
                        onPointerDown={(e) => {
                          e.preventDefault();
                          beginDrag(iso);
                        }}
                        className={[
                          "h-6 border-b border-r border-rule transition-colors duration-100",
                          m % 60 === 0 ? "border-t-0" : "",
                          isMine ? "ring-1 ring-inset ring-brick" : "",
                          locked ? "cursor-default" : "cursor-pointer",
                        ].join(" ")}
                        style={heatStyle(count, total)}
                        title={`${dayNumber(d)} ${minutesToTime(m)} — ${count} free`}
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-5 border-t border-rule pt-5">
        <span className="flex items-center gap-2 text-xs text-umber">
          <span className="h-3 w-6 border border-rule" style={heatStyle(0, total)} />
          nobody
        </span>
        <span className="flex items-center gap-2 text-xs text-umber">
          <span className="h-3 w-6 border border-rule" style={heatStyle(Math.max(1, total), Math.max(1, total))} />
          everyone
        </span>
        <span className="flex items-center gap-2 text-xs text-umber">
          <span className="h-3 w-6 border border-rule ring-1 ring-inset ring-brick" />
          your pick
        </span>
        {!loaded ? <span className="text-xs text-umber">loading…</span> : null}
      </div>
    </div>
  );
}
