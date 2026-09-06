"use client";

import { useState, useTransition } from "react";
import { createSessionAction, type CreateSessionForm } from "@/app/actions";
import { writeIdentity } from "@/lib/local-identity";
import { Button, Card, Field, Notice } from "@/components/ui";
import { CopyLink } from "@/components/copy-link";
import type { CreateSessionFailure } from "@/lib/session-service";

const MESSAGES: Record<CreateSessionFailure, string> = {
  invalid_title: "Give the plan a name.",
  invalid_name: "Enter your own name — you take part too.",
  invalid_pin: "PINs are exactly four digits.",
  invalid_date_range: "The last day cannot fall before the first.",
  invalid_time_window: "The daily end time must come after the start time.",
  invalid_capacity: "A plan needs room for at least one person.",
};

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

type Created = { sessionId: string; adminToken: string };

export function CreateSessionForm() {
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Created | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData(e.currentTarget);
    const form: CreateSessionForm = {
      title: String(fd.get("title") ?? ""),
      startDate: String(fd.get("startDate") ?? ""),
      endDate: String(fd.get("endDate") ?? ""),
      startTime: String(fd.get("startTime") ?? ""),
      endTime: String(fd.get("endTime") ?? ""),
      maxParticipants: String(fd.get("maxParticipants") ?? ""),
      adminName: String(fd.get("adminName") ?? ""),
      adminPin: String(fd.get("adminPin") ?? ""),
    };

    startTransition(async () => {
      const result = await createSessionAction(form);
      if (!result.ok) {
        setError(MESSAGES[result.reason]);
        return;
      }
      writeIdentity(window.localStorage, result.sessionId, {
        participantId: result.participantId,
        name: result.name,
        adminToken: result.adminToken,
      });
      setCreated({ sessionId: result.sessionId, adminToken: result.adminToken });
    });
  }

  if (created) {
    const origin = window.location.origin;
    return (
      <Card className="rise">
        <h2 className="text-2xl">Your plan is live</h2>
        <p className="mt-2 text-sm text-umber">
          Share the first link with everyone. Keep the second one to yourself — it
          grants full control of the plan, and anyone who has it holds the same power.
        </p>
        <div className="mt-7 space-y-5">
          <CopyLink label="Share with the group" url={`${origin}/s/${created.sessionId}`} />
          <CopyLink
            label="Your private organiser link"
            url={`${origin}/s/${created.sessionId}/admin/${created.adminToken}`}
          />
        </div>
        <div className="mt-7 border-t border-rule pt-5">
          <a
            className="text-sm text-maroon underline decoration-rule-strong underline-offset-4"
            href={`/s/${created.sessionId}/admin/${created.adminToken}`}
          >
            Open the plan
          </a>
        </div>
      </Card>
    );
  }

  return (
    <Card className="rise">
      <form onSubmit={onSubmit} className="space-y-6">
        <Field label="What is the plan">
          <input name="title" placeholder="Sunday lunch in Ari" required maxLength={120} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="First day">
            <input type="date" name="startDate" defaultValue={isoDate(1)} required />
          </Field>
          <Field label="Last day">
            <input type="date" name="endDate" defaultValue={isoDate(8)} required />
          </Field>
          <Field label="Earliest time each day">
            <input type="time" name="startTime" defaultValue="09:00" step={1800} required />
          </Field>
          <Field label="Latest time each day">
            <input type="time" name="endTime" defaultValue="23:00" step={1800} required />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Room for">
            <input type="number" name="maxParticipants" defaultValue={8} min={1} max={200} required />
          </Field>
          <Field label="Your name">
            <input name="adminName" placeholder="Mook" required maxLength={40} />
          </Field>
          <Field label="Your 4-digit PIN">
            <input
              name="adminPin"
              data-pin=""
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              placeholder="0000"
              required
            />
          </Field>
        </div>

        {error ? <Notice>{error}</Notice> : null}

        <div className="flex items-center gap-4 pt-1">
          <Button type="submit" disabled={pending}>
            {pending ? "Creating…" : "Create the plan"}
          </Button>
          <span className="text-xs text-umber">
            No account. Your name and PIN are how you get back in.
          </span>
        </div>
      </form>
    </Card>
  );
}
