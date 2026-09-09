"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToParentElement, restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  addActivityAction,
  readActivitiesAction,
  setRankingAction,
  type GroupEntry,
  type PoolEntry,
} from "@/app/actions";
import { Button, Field, Notice, QuietButton, Tag } from "@/components/ui";

const ADD_MESSAGES: Record<string, string> = {
  invalid_name: "Give the place a name.",
  duplicate_name: "That is already on the list.",
  no_such_session: "That plan no longer exists.",
  not_a_participant: "This device is no longer signed in to this plan.",
  not_signed_in: "This device is no longer signed in to this plan.",
  session_finalized: "The plan is settled, so the list is locked.",
};

function Thumb({ entry }: { entry: PoolEntry }) {
  const [broken, setBroken] = useState(false);
  if (!entry.imageUrl || broken) {
    return <div className="h-10 w-14 shrink-0 rounded-sm border border-rule bg-cream" />;
  }
  return (
    // Hosts vary per suggestion, so this stays a plain img rather than adding
    // every possible domain to the image config.
    <img
      src={entry.imageUrl}
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
      className="h-10 w-14 shrink-0 rounded-sm border border-rule object-cover"
    />
  );
}

function SortableRow({
  entry,
  index,
  locked,
  onRemove,
}: {
  entry: PoolEntry;
  index: number;
  locked: boolean;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: entry.id, disabled: locked });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`flex items-center gap-3 border-b border-rule bg-paper py-2.5 ${
        isDragging ? "relative z-10 opacity-90" : ""
      }`}
      data-rank-item={entry.id}
    >
      <span className="w-6 shrink-0 text-center font-mono text-xs text-umber">
        {index + 1}
      </span>
      <Thumb entry={entry} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm">{entry.name}</span>
        {entry.locationName ? (
          <span className="block truncate text-xs text-umber">{entry.locationName}</span>
        ) : null}
      </span>
      {locked ? null : (
        <>
          <button
            type="button"
            aria-label={`Reorder ${entry.name}`}
            className="cursor-grab px-2 text-umber active:cursor-grabbing"
            style={{ touchAction: "none" }}
            {...attributes}
            {...listeners}
          >
            <svg width="12" height="16" viewBox="0 0 12 16" aria-hidden="true">
              <g fill="currentColor">
                <circle cx="3" cy="4" r="1.4" />
                <circle cx="9" cy="4" r="1.4" />
                <circle cx="3" cy="8" r="1.4" />
                <circle cx="9" cy="8" r="1.4" />
                <circle cx="3" cy="12" r="1.4" />
                <circle cx="9" cy="12" r="1.4" />
              </g>
            </svg>
          </button>
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Remove ${entry.name} from your order`}
            className="px-2 text-lg leading-none text-umber transition-colors hover:text-maroon"
          >
            &minus;
          </button>
        </>
      )}
    </li>
  );
}

export function ActivitiesPanel({
  sessionId,
  locked,
  onIdentityLost,
}: {
  sessionId: string;
  locked: boolean;
  onIdentityLost: () => void;
}) {
  const [pool, setPool] = useState<PoolEntry[]>([]);
  const [mine, setMine] = useState<string[]>([]);
  const [group, setGroup] = useState<GroupEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, startAdding] = useTransition();
  const [showForm, setShowForm] = useState(false);

  const byId = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool]);
  const ranked = useMemo(
    () => mine.map((id) => byId.get(id)).filter((x): x is PoolEntry => !!x),
    [mine, byId],
  );
  const unranked = useMemo(() => pool.filter((p) => !mine.includes(p.id)), [pool, mine]);

  const refresh = useCallback(async () => {
    const snap = await readActivitiesAction(sessionId);
    if (!snap) {
      onIdentityLost();
      return;
    }
    setPool(snap.pool);
    setMine(snap.mine);
    setGroup(snap.group);
  }, [sessionId, onIdentityLost]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const commit = useCallback(
    async (order: string[]) => {
      const result = await setRankingAction(sessionId, order);
      if (!result.ok) setError(ADD_MESSAGES[result.reason] ?? "That could not be saved.");
      await refresh();
    },
    [sessionId, refresh],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const from = mine.indexOf(String(active.id));
    const to = mine.indexOf(String(over.id));
    if (from < 0 || to < 0) return;

    const next = arrayMove(mine, from, to);
    setMine(next);
    void commit(next);
  }

  function addToOrder(id: string) {
    const next = [...mine, id];
    setMine(next);
    void commit(next);
  }

  function removeFromOrder(id: string) {
    const next = mine.filter((x) => x !== id);
    setMine(next);
    void commit(next);
  }

  function onAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const form = {
      name: String(fd.get("name") ?? ""),
      locationName: String(fd.get("locationName") ?? ""),
      imageInput: String(fd.get("imageInput") ?? ""),
    };
    const el = e.currentTarget;

    startAdding(async () => {
      const result = await addActivityAction(sessionId, form);
      if (!result.ok) {
        setError(ADD_MESSAGES[result.reason] ?? "That could not be added.");
        return;
      }
      el.reset();
      setShowForm(false);
      await refresh();
    });
  }

  const topScore = group[0]?.score ?? 0;

  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="text-2xl">What to eat</h2>
        <p className="text-xs uppercase tracking-[0.09em] text-umber">
          {pool.length === 0 ? "Nothing suggested yet" : `${pool.length} on the list`}
        </p>
      </div>

      {error ? (
        <div className="mt-4">
          <Notice>{error}</Notice>
        </div>
      ) : null}

      {/* Group result */}
      {group.length > 0 ? (
        <div className="mt-6">
          <h3 className="text-xs uppercase tracking-[0.09em] text-umber">
            Where the group stands
          </h3>
          <ol className="mt-3 space-y-2">
            {group.map((g, i) => (
              <li key={g.activityId} className="flex items-center gap-3">
                <span className="w-6 shrink-0 text-center font-mono text-xs text-umber">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-sm">{g.name}</span>
                    <span className="shrink-0 font-mono text-xs text-umber">
                      {g.score}
                    </span>
                  </span>
                  <span className="mt-1 block h-1.5 rounded-sm bg-cream">
                    <span
                      className="block h-full rounded-sm bg-maroon"
                      style={{
                        width: topScore > 0 ? `${(g.score / topScore) * 100}%` : "0%",
                      }}
                    />
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      {/* Personal ranking */}
      <div className="mt-8">
        <h3 className="text-xs uppercase tracking-[0.09em] text-umber">Your order</h3>
        {ranked.length === 0 ? (
          <p className="mt-3 text-sm text-umber">
            {pool.length === 0
              ? "Suggest somewhere below to get started."
              : "Add options from the list below, then drag them into the order you want."}
          </p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={onDragEnd}
          >
            <SortableContext items={mine} strategy={verticalListSortingStrategy}>
              <ol className="mt-3 border-t border-rule">
                {ranked.map((entry, index) => (
                  <SortableRow
                    key={entry.id}
                    entry={entry}
                    index={index}
                    locked={locked}
                    onRemove={() => removeFromOrder(entry.id)}
                  />
                ))}
              </ol>
            </SortableContext>
          </DndContext>
        )}
      </div>

      {/* The rest of the pool */}
      {unranked.length > 0 ? (
        <div className="mt-7">
          <h3 className="text-xs uppercase tracking-[0.09em] text-umber">
            Not in your order yet
          </h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {unranked.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  disabled={locked}
                  onClick={() => addToOrder(entry.id)}
                  data-add-to-order={entry.id}
                  className="flex items-center gap-2 rounded-md border border-rule bg-paper py-1.5 pl-1.5 pr-3 text-sm transition-colors hover:border-rule-strong disabled:opacity-40"
                >
                  <Thumb entry={entry} />
                  <span className="max-w-[12rem] truncate">{entry.name}</span>
                  <span className="text-umber">+</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {/* Suggest something */}
      {locked ? null : (
        <div className="mt-8 border-t border-rule pt-6">
          {showForm ? (
            <form onSubmit={onAdd} className="space-y-5">
              <Field label="Place or dish">
                <input name="name" placeholder="Som Tam Nua" required maxLength={120} />
              </Field>
              <Field label="Where it is (optional)">
                <input name="locationName" placeholder="Siam Square Soi 5" maxLength={200} />
              </Field>
              <Field label="Image or page link (optional)">
                <input name="imageInput" placeholder="https://…" maxLength={500} />
              </Field>
              <p className="text-xs text-umber">
                Paste a picture link, or a link to the place — the preview image is taken
                from the page. Left blank, a stock photo is used.
              </p>
              <div className="flex items-center gap-3">
                <Button type="submit" disabled={adding}>
                  {adding ? "Adding…" : "Add to the list"}
                </Button>
                <QuietButton type="button" onClick={() => setShowForm(false)}>
                  Cancel
                </QuietButton>
              </div>
            </form>
          ) : (
            <QuietButton type="button" onClick={() => setShowForm(true)}>
              Suggest somewhere
            </QuietButton>
          )}
        </div>
      )}

      {locked ? (
        <p className="mt-6 text-sm text-umber">
          <Tag>Locked</Tag>
        </p>
      ) : null}
    </div>
  );
}
