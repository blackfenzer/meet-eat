"use client";

import { useEffect, useRef, useState } from "react";

export type MapPin = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
};

declare global {
  interface Window {
    longdo?: {
      Map: new (options: { placeholder: HTMLElement; zoom?: number }) => LongdoMap;
      Marker: new (
        location: { lon: number; lat: number },
        options?: { title?: string; detail?: string },
      ) => unknown;
    };
  }
}

type LongdoMap = {
  Overlays: { add: (overlay: unknown) => void; clear: () => void };
  location: (loc: { lon: number; lat: number }, animate?: boolean) => void;
  zoom: (level: number, animate?: boolean) => void;
};

const SCRIPT_ID = "longdo-map-api";

/** Loads the Longdo API once per page, however many maps ask for it. */
function loadLongdo(apiKey: string): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.longdo) return Promise.resolve();

  const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("longdo failed")));
    });
  }

  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = SCRIPT_ID;
    script.src = `https://api.longdo.com/map3/?key=${encodeURIComponent(apiKey)}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("longdo failed"));
    document.head.appendChild(script);
  });
}

export function LocationMap({ apiKey, pins }: { apiKey: string | null; pins: MapPin[] }) {
  const holder = useRef<HTMLDivElement | null>(null);
  const map = useRef<LongdoMap | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!apiKey || pins.length === 0 || !holder.current) return;
    let cancelled = false;

    loadLongdo(apiKey)
      .then(() => {
        if (cancelled || !holder.current || !window.longdo) return;
        map.current ??= new window.longdo.Map({ placeholder: holder.current });

        map.current.Overlays.clear();
        for (const pin of pins) {
          map.current.Overlays.add(
            new window.longdo.Marker(
              { lon: pin.longitude, lat: pin.latitude },
              { title: pin.name, detail: pin.name },
            ),
          );
        }
        // Centre on the first pin; the group is usually in one neighbourhood.
        map.current.location({ lon: pins[0].longitude, lat: pins[0].latitude }, true);
        map.current.zoom(pins.length === 1 ? 15 : 13, true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [apiKey, pins]);

  if (pins.length === 0) return null;

  if (!apiKey) {
    return (
      <p className="mt-3 text-xs text-umber">
        Add a Longdo Map key to show these places on a map.
      </p>
    );
  }

  if (failed) {
    return (
      <p className="mt-3 text-xs text-umber">
        The map could not be loaded. The links below still work.
      </p>
    );
  }

  return (
    <div
      ref={holder}
      className="mt-3 h-64 w-full overflow-hidden rounded-[10px] border border-rule"
    />
  );
}
