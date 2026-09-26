"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  adminFinalizeAction,
  adminRemoveActivityAction,
  adminRemoveParticipantAction,
  adminReopenAction,
  adminResetPinAction,
  adminUpdateSettingsAction,
  type AdminActionResult,
} from "@/app/actions";
import { Button, Card, Field, Notice, QuietButton, Tag } from "@/components/ui";
import { minutesToTime } from "@/lib/time";

const MESSAGES: Record<string, string> = {
  forbidden: "That organiser link is no longer valid.",
  no_such_session: "This plan no longer exists.",
  invalid_title: "Give the plan a name.",
  invalid_date_range: "The last day cannot fall before the first.",
  invalid_time_window: "The end time must come after the start time.",
  invalid_capacity: "A plan needs room for at least one person.",
  cap_below_current: "That is fewer seats than people already here.",
  invalid_pin: "PINs are exactly four digits.",
  not_a_participant: "That person is not in this plan.",
  cannot_remove_admin: "You cannot remove yourself as organiser.",
  unknown_activity: "That option is not in this plan.",
};

export type AdminPerson = {
  id: string;
  name: string;
  pin: string;
  isAdmin: boolean;
  guestNumber: number;
};

export type AdminActivity = { id: string; name: string; locationName: string | null };

export type AdminView = {
  sessionId: string;
  adminToken: string;
  title: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  maxParticipants: number;
  anonymousMode: boolean;
  status: "open" | "finalized";
  finalDate: string | null;
  finalStartMinutes: number | null;
  finalEndMinutes: number | null;
  finalActivityId: string | null;
  people: AdminPerson[];
  activities: AdminActivity[];
};

export function AdminPanel({ view }: { view: AdminView }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, start] = useTransition();

  function run(action: () => Promise<AdminActionResult>) {
    setError(null);
    start(async () => {
      const r = await action();
      if (!r.ok) setError(MESSAGES[r.reason] ?? "That did not work.");
      else router.refresh();
    });
  }

  function onSettings(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    run(() =>
      adminUpdateSettingsAction(view.sessionId, view.adminToken, {
        title: String(fd.get("title") ?? ""),
        startDate: String(fd.get("startDate") ?? ""),
        endDate: String(fd.get("endDate") ?? ""),
        startTime: String(fd.get("startTime") ?? ""),
        endTime: String(fd.get("endTime") ?? ""),
        maxParticipants: String(fd.get("maxParticipants") ?? ""),
        anonymousMode: fd.get("anonymousMode") === "on",
      }),
    );
  }

  function onFinalize(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const chosen = String(fd.get("activityId") ?? "");
    run(() =>
      adminFinalizeAction(view.sessionId, view.adminToken, {
        date: String(fd.get("date") ?? ""),
        startTime: String(fd.get("startTime") ?? ""),
        endTime: String(fd.get("endTime") ?? ""),
        activityId: chosen || null,
      }),
    );
  }

  return (
    <div className="space-y-8">
      {error ? <Notice>{error}</Notice> : null}

      <Card>
        <h2 className="text-2xl">Settings</h2>
        <form onSubmit={onSettings} className="mt-6 space-y-5">
          <Field label="Plan name">
            <input name="title" defaultValue={view.title} required maxLength={120} />
          </Field>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="First day">
              <input type="date" name="startDate" defaultValue={view.startDate} required />
            </Field>
            <Field label="Last day">
              <input type="date" name="endDate" defaultValue={view.endDate} required />
            </Field>
            <Field label="Earliest each day">
              <input type="time" name="startTime" defaultValue={view.startTime} step={1800} required />
            </Field>
            <Field label="Latest each day">
              <input type="time" name="endTime" defaultValue={view.endTime} step={1800} required />
            </Field>
          </div>
          <Field label="Room for">
            <input type="number" name="maxParticipants" defaultValue={view.maxParticipants} min={1} max={200} required />
          </Field>
          <label className="flex items-center gap-3 text-sm normal-case tracking-normal text-ink">
            <input
              type="checkbox"
              name="anonymousMode"
              defaultChecked={view.anonymousMode}
              className="h-4 w-4"
            />
            Hide real names from participants (you still see them)
          </label>
          <Button type="submit" disabled={busy}>Save settings</Button>
        </form>
      </Card>

      <Card>
        <h2 className="text-2xl">People</h2>
        <p className="mt-2 text-sm text-umber">
          PINs are shown so you can help anyone who forgets theirs.
        </p>
        <ul className="mt-6 divide-y divide-rule">
          {view.people.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
              <span className="min-w-0 flex-1">
                <span className="truncate">{p.name}</span>
                {p.isAdmin ? <span className="ml-2"><Tag>Organiser</Tag></span> : null}
                <span className="ml-2 text-xs text-umber">Guest {p.guestNumber}</span>
              </span>
              <code className="font-mono text-sm tracking-[0.3em] text-umber">{p.pin}</code>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const pin = new FormData(e.currentTarget).get("pin");
                  run(() => adminResetPinAction(view.sessionId, view.adminToken, p.id, String(pin ?? "")));
                }}
                className="flex items-center gap-2"
              >
                <input
                  name="pin"
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="new"
                  aria-label={`New PIN for ${p.name}`}
                  className="w-20 text-center"
                />
                <QuietButton type="submit">Reset</QuietButton>
              </form>
              {p.isAdmin ? null : (
                <QuietButton
                  type="button"
                  onClick={() => run(() => adminRemoveParticipantAction(view.sessionId, view.adminToken, p.id))}
                >
                  Remove
                </QuietButton>
              )}
            </li>
          ))}
        </ul>
      </Card>

      {view.activities.length > 0 ? (
        <Card>
          <h2 className="text-2xl">Options</h2>
          <ul className="mt-6 divide-y divide-rule">
            {view.activities.map((a) => (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{a.name}</span>
                  {a.locationName ? (
                    <span className="block truncate text-xs text-umber">{a.locationName}</span>
                  ) : null}
                </span>
                <QuietButton
                  type="button"
                  onClick={() => run(() => adminRemoveActivityAction(view.sessionId, view.adminToken, a.id))}
                >
                  Remove
                </QuietButton>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <h2 className="text-2xl">{view.status === "finalized" ? "Settled" : "Settle the plan"}</h2>
        {view.status === "finalized" ? (
          <div className="mt-4 space-y-5">
            <p className="text-sm text-umber">
              {view.finalDate}
              {view.finalStartMinutes !== null && view.finalEndMinutes !== null
                ? ` · ${minutesToTime(view.finalStartMinutes)}–${minutesToTime(view.finalEndMinutes)}`
                : ""}
            </p>
            <QuietButton
              type="button"
              onClick={() => run(() => adminReopenAction(view.sessionId, view.adminToken))}
            >
              Reopen for changes
            </QuietButton>
          </div>
        ) : (
          <form onSubmit={onFinalize} className="mt-6 space-y-5">
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Day">
                <input type="date" name="date" defaultValue={view.startDate} required />
              </Field>
              <Field label="From">
                <input type="time" name="startTime" defaultValue={view.startTime} step={1800} required />
              </Field>
              <Field label="Until">
                <input type="time" name="endTime" defaultValue={view.endTime} step={1800} required />
              </Field>
            </div>
            <Field label="Where">
              <select name="activityId" defaultValue="">
                <option value="">No place chosen</option>
                {view.activities.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
            <Button type="submit" disabled={busy}>Settle it</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
