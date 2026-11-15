/*
 * The exam laptop's own identity (browser only): a random id kept in this browser (`localStorage`, so a reload is the same
 * laptop and a second laptop never shares it) and the room label ("Room 2"). The server never trusts the label for security:
 * the id decides which laptop a pass and a PIN lock belong to. Reads and writes never throw (private windows block storage).
 */
const ID_KEY = "cefro-exam-laptop";
const ROOM_KEY = (classMockId: string) => `cefro-exam-room-${classMockId}`;
let memoryId: string | null = null;

function randomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("").slice(0, 32);
}

export function laptopId(): string {
  try {
    const stored = window.localStorage.getItem(ID_KEY);
    if (stored && /^[A-Za-z0-9_-]{16,64}$/.test(stored)) return stored;
    const fresh = randomId();
    window.localStorage.setItem(ID_KEY, fresh);
    return fresh;
  } catch {
    return (memoryId ??= randomId());
  }
}

export function rememberRoom(classMockId: string, room: string): void {
  try {
    window.localStorage.setItem(ROOM_KEY(classMockId), room);
  } catch {
    /* storage blocked: the room stays in the address */
  }
}

export function recallRoom(classMockId: string): string | null {
  try {
    return window.localStorage.getItem(ROOM_KEY(classMockId));
  } catch {
    return null;
  }
}
