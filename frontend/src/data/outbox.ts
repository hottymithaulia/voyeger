import { db } from "@/data/db";
import { api } from "@/net/api";
import type { Enquiry, Event, OutboxItem, PartnerApplication } from "@/types";

function makeId(): string {
  return crypto.randomUUID();
}

async function enqueue(kind: OutboxItem["kind"], payload: OutboxItem["payload"], idempotencyId = makeId()): Promise<void> {
  await db.outbox.add({
    idempotency_id: idempotencyId,
    kind,
    payload,
    created_at: new Date().toISOString(),
    retry_at: 0,
    attempts: 0,
  });
}

export function logEvent(type: Event["type"], placeId: string, partnerId?: string): Promise<void> {
  const event: Event = {
    id: makeId(),
    type,
    place_id: placeId,
    ...(partnerId ? { partner_id: partnerId } : {}),
    ts: new Date().toISOString(),
    session_id: getSessionId(),
  };
  return enqueue("event", event, event.id);
}

let sessionId: string | undefined;

function getSessionId(): string {
  if (!sessionId) sessionId = makeId();
  return sessionId;
}

export function queueEnquiry(enquiry: Omit<Enquiry, "id" | "created_at">): Promise<void> {
  const id = makeId();
  return enqueue("enquiry", { ...enquiry, id, created_at: new Date().toISOString() }, id);
}

export function queuePartnerApplication(
  application: Omit<PartnerApplication, "id" | "created_at">,
): Promise<void> {
  const id = makeId();
  return enqueue("partner_application", { ...application, id, created_at: new Date().toISOString() }, id);
}

export async function listOutbox(): Promise<OutboxItem[]> {
  return db.outbox.orderBy("created_at").toArray();
}

function retryDelay(attempts: number): number {
  return Math.min(1000 * 2 ** Math.min(attempts, 10), 6 * 60 * 60 * 1000);
}

export async function flushOutbox(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.onLine || !(await api.health())) return;
  const due = (await db.outbox.orderBy("created_at").toArray()).filter((item) => item.retry_at <= Date.now()).slice(0, 50);
  const eventItems = due.filter((item) => item.kind === "event");
  const appItems = due.filter((item) => item.kind === "partner_application");
  const enquiryItems = due.filter((item) => item.kind === "enquiry");
  const groups = [
    { items: eventItems, send: () => api.postEvents(eventItems.map((item) => item.payload as Event)) },
    ...appItems.map((item) => ({ items: [item], send: () => api.applyPartner(item.payload as PartnerApplication) })),
    ...enquiryItems.map((item) => ({ items: [item], send: () => api.postEnquiry(item.payload as Enquiry) })),
  ];
  for (const group of groups) {
    if (group.items.length === 0) continue;
    try {
      await group.send();
      await db.outbox.bulkDelete(group.items.flatMap((item) => item.id === undefined ? [] : [item.id]));
    } catch {
      await db.outbox.bulkPut(
        group.items.flatMap((item) =>
          item.id === undefined
            ? []
            : [{ ...item, attempts: item.attempts + 1, retry_at: Date.now() + retryDelay(item.attempts + 1) }],
        ),
      );
    }
  }
}