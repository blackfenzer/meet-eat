"use client";

import { useEffect, useState, useTransition } from "react";
import { joinSessionAction, resolveNameAction } from "@/app/actions";
import {
  clearIdentity,
  readIdentity,
  writeIdentity,
  type LocalIdentity,
} from "@/lib/local-identity";
import { messageForJoinFailure, stepForNameStatus, type JoinStep } from "@/lib/join-ui";
import { Button, Card, Field, Notice, QuietButton, Tag } from "@/components/ui";

export function JoinFlow({
  sessionId,
  title,
}: {
  sessionId: string;
  title: string;
}) {
  // Undefined until the browser has been checked, so the form never flashes
  // in front of someone this device already knows.
  const [identity, setIdentity] = useState<LocalIdentity | null | undefined>(undefined);
  const [step, setStep] = useState<JoinStep>("name");
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setIdentity(readIdentity(window.localStorage, sessionId));
  }, [sessionId]);

  function submitName(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const typed = name.trim();
    if (!typed) {
      setError("Enter a name so everyone knows who is free when.");
      return;
    }
    startTransition(async () => {
      const status = await resolveNameAction(sessionId, typed);
      if (status === null) {
        setError("That plan no longer exists. Ask whoever shared the link.");
        return;
      }
      setStep(stepForNameStatus(status));
    });
  }

  function submitPin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await joinSessionAction(sessionId, name.trim(), pin);
      if (!result.ok) {
        setError(messageForJoinFailure(result.reason));
        // A rejected PIN sends them back to the name step, since the spec's
        // remedy for a wrong PIN is to pick a different name.
        if (result.reason === "wrong_pin") setStep("name");
        return;
      }
      const next: LocalIdentity = {
        participantId: result.participantId,
        name: result.name,
      };
      writeIdentity(window.localStorage, sessionId, next);
      setIdentity(next);
    });
  }

  function startOver() {
    clearIdentity(window.localStorage, sessionId);
    setIdentity(null);
    setStep("name");
    setName("");
    setPin("");
    setError(null);
  }

  if (identity === undefined) {
    return (
      <Card>
        <p className="text-sm text-umber">Checking this device…</p>
      </Card>
    );
  }

  if (identity) {
    return (
      <Card className="rise">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <Tag>You are in</Tag>
            <h2 className="mt-3 text-2xl">{identity.name}</h2>
          </div>
          <QuietButton type="button" onClick={startOver}>
            Not you
          </QuietButton>
        </div>
        <p className="mt-6 border-t border-rule pt-6 text-sm text-umber">
          Marking when you are free comes next. This device will remember you, so the
          link takes you straight back here.
        </p>
      </Card>
    );
  }

  return (
    <Card className="rise">
      <h2 className="text-2xl">{title}</h2>

      {step === "name" ? (
        <form onSubmit={submitName} className="mt-6 space-y-5">
          <Field label="Your name">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ploy"
              maxLength={40}
              autoFocus
            />
          </Field>
          {error ? <Notice>{error}</Notice> : null}
          <Button type="submit" disabled={pending}>
            {pending ? "Checking…" : "Continue"}
          </Button>
        </form>
      ) : null}

      {step === "set-pin" || step === "enter-pin" ? (
        <form onSubmit={submitPin} className="mt-6 space-y-5">
          <p className="text-sm text-umber">
            {step === "set-pin"
              ? `No one here is called ${name.trim()} yet. Choose a 4-digit PIN — it is how you get back in from another phone.`
              : `${name.trim()} is already on this plan. Enter that PIN to pick up where they left off.`}
          </p>
          <Field label={step === "set-pin" ? "Choose a PIN" : "Enter the PIN"}>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
              data-pin=""
              inputMode="numeric"
              maxLength={4}
              placeholder="0000"
              autoFocus
            />
          </Field>
          {error ? <Notice>{error}</Notice> : null}
          <div className="flex items-center gap-3">
            <Button type="submit" disabled={pending || pin.length !== 4}>
              {pending ? "Joining…" : step === "set-pin" ? "Join the plan" : "Log back in"}
            </Button>
            <QuietButton type="button" onClick={() => { setStep("name"); setPin(""); setError(null); }}>
              Change name
            </QuietButton>
          </div>
        </form>
      ) : null}

      {step === "full" ? (
        <div className="mt-6 space-y-5">
          <Notice>
            This plan is full, so no new names can join. If you have joined before, go
            back and use the exact name you used then — your PIN will let you in even
            when the room is full.
          </Notice>
          <QuietButton type="button" onClick={() => { setStep("name"); setError(null); }}>
            Try another name
          </QuietButton>
        </div>
      ) : null}
    </Card>
  );
}
