import { Card, Tag } from "@/components/ui";
import { appleMapsTransitUrl, googleMapsTransitUrl } from "@/lib/map-links";
import { minutesToTime } from "@/lib/time";

export type FinalPlanView = {
  title: string;
  date: Date | null;
  startMinutes: number | null;
  endMinutes: number | null;
  activity: {
    name: string;
    locationName: string | null;
    latitude: number | null;
    longitude: number | null;
    imageUrl: string | null;
  } | null;
};

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  });
}

export function FinalPlan({ plan }: { plan: FinalPlanView }) {
  const destination = plan.activity
    ? {
        latitude: plan.activity.latitude,
        longitude: plan.activity.longitude,
        name: plan.activity.locationName ?? plan.activity.name,
      }
    : null;

  return (
    <Card className="rise">
      <Tag>Settled</Tag>
      <h2 className="mt-4 text-3xl">{plan.title}</h2>

      <p className="mt-4 text-lg">
        {plan.date ? formatDate(plan.date) : "Date to be confirmed"}
        {plan.startMinutes !== null && plan.endMinutes !== null ? (
          <span className="text-umber">
            {" · "}
            {minutesToTime(plan.startMinutes)}–{minutesToTime(plan.endMinutes)}
          </span>
        ) : null}
      </p>

      {plan.activity ? (
        <div className="mt-7 border-t border-rule pt-6">
          {plan.activity.imageUrl ? (
            <img
              src={plan.activity.imageUrl}
              alt=""
              className="mb-5 h-40 w-full rounded-[10px] border border-rule object-cover"
            />
          ) : null}
          <h3 className="text-2xl">{plan.activity.name}</h3>
          {plan.activity.locationName ? (
            <p className="mt-1 text-sm text-umber">{plan.activity.locationName}</p>
          ) : null}

          {destination ? (
            <div className="mt-6 flex flex-wrap gap-3">
              <a
                href={googleMapsTransitUrl(destination)}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-md bg-maroon px-5 py-2.5 text-sm text-cream transition-colors hover:bg-brick"
              >
                Get there with Google Maps
              </a>
              <a
                href={appleMapsTransitUrl(destination)}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-md border border-rule px-5 py-2.5 text-sm text-umber transition-colors hover:border-rule-strong hover:text-maroon"
              >
                Apple Maps
              </a>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-6 border-t border-rule pt-6 text-sm text-umber">
          No place was chosen — just the time.
        </p>
      )}
    </Card>
  );
}
