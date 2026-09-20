/**
 * What a viewer is allowed to see a participant called.
 *
 * SPEC.md: with anonymous mode on, people see each other as "Guest N" — but
 * the organiser always sees real names, because they cannot moderate people
 * they cannot identify, and you always see your own name so the page still
 * makes sense to you.
 */

export type NamedParticipant = {
  id: string;
  name: string;
  guestNumber: number;
};

export type Viewer = {
  anonymous: boolean;
  viewerId: string | null;
  viewerIsAdmin: boolean;
};

export function displayNameFor(participant: NamedParticipant, viewer: Viewer): string {
  if (!viewer.anonymous) return participant.name;
  if (viewer.viewerIsAdmin) return participant.name;
  if (viewer.viewerId && viewer.viewerId === participant.id) return participant.name;
  return `Guest ${participant.guestNumber}`;
}
