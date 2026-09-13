import { and, desc, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { db } from "../index.ts";
import {
  notification as notificationTable,
  notificationRead as notificationReadTable,
} from "../db/schema.ts";
import { ownedWhere, resolveOwned } from "./workspace-resource.ts";
import { dispatchEvent } from "./event-dispatch.ts";

type Database = typeof db;
type NotificationContext = {
  orgId: string;
  workspaceId: string;
  agentId?: string;
};

const agentOwnedWhere = (ctx: NotificationContext, id: string) =>
  and(
    ownedWhere("notification", id, ctx.workspaceId),
    ctx.agentId ? eq(notificationTable.agentId, ctx.agentId) : undefined,
  );

export const createNotification = async (
  database: Database,
  ctx: Required<NotificationContext>,
  data: { title?: string; body: string },
) => {
  const rows = await database
    .insert(notificationTable)
    .values({
      id: nanoid(),
      workspaceId: ctx.workspaceId,
      agentId: ctx.agentId,
      title: data.title ?? null,
      body: data.body.replace(/\\n/g, "\n").replace(/\\t/g, "\t"),
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning();
  dispatchEvent(ctx.orgId, ctx.workspaceId, "notification.created", rows[0]);
  return rows[0];
};

export const listNotifications = (
  database: Database,
  ctx: Required<NotificationContext>,
  limit: number,
) =>
  database
    .select()
    .from(notificationTable)
    .where(
      and(
        eq(notificationTable.workspaceId, ctx.workspaceId),
        eq(notificationTable.agentId, ctx.agentId),
      ),
    )
    .orderBy(desc(notificationTable.createdAt))
    .limit(limit);

export const updateNotification = async (
  database: Database,
  ctx: Required<NotificationContext>,
  id: string,
  data: { title?: string; body?: string },
) => {
  const rows = await database
    .update(notificationTable)
    .set({
      ...(data.title !== undefined && { title: data.title }),
      ...(data.body !== undefined && {
        body: data.body.replace(/\\n/g, "\n").replace(/\\t/g, "\t"),
      }),
      updatedAt: new Date(),
    })
    .where(agentOwnedWhere(ctx, id))
    .returning();
  if (!rows.length) return null;
  dispatchEvent(ctx.orgId, ctx.workspaceId, "notification.updated", rows[0]);
  return rows[0];
};

export const deleteNotification = async (
  database: Database,
  ctx: NotificationContext,
  id: string,
) => {
  if (ctx.agentId) {
    const existing = await database
      .select({ id: notificationTable.id })
      .from(notificationTable)
      .where(agentOwnedWhere(ctx, id))
      .limit(1);
    if (!existing.length) return false;
  }
  const rows = await database
    .delete(notificationTable)
    .where(agentOwnedWhere(ctx, id))
    .returning();
  if (Array.isArray(rows) && rows.length === 0) return false;
  dispatchEvent(ctx.orgId, ctx.workspaceId, "notification.dismissed", {
    notificationId: id,
  });
  return true;
};

export const requireNotification = (
  database: Database,
  id: string,
  workspaceId: string,
) => resolveOwned(database, "notification", id, workspaceId);

export const markRead = async (
  database: Database,
  ctx: { orgId: string; workspaceId: string },
  notificationId: string,
  userId: string,
) => {
  const owned = await resolveOwned(
    database,
    "notification",
    notificationId,
    ctx.workspaceId,
  );
  if (!owned) return false;
  await database
    .insert(notificationReadTable)
    .values({ id: nanoid(), notificationId, userId })
    .onConflictDoNothing();
  dispatchEvent(ctx.orgId, ctx.workspaceId, "notification.read", {
    notificationId,
    userId,
  });
  return true;
};

export const markAllRead = async (
  database: Database,
  ctx: { orgId: string; workspaceId: string },
  notificationIds: string[],
  userId: string,
) => {
  if (notificationIds.length === 0) return;
  await database
    .insert(notificationReadTable)
    .values(
      notificationIds.map((notificationId) => ({
        id: nanoid(),
        notificationId,
        userId,
      })),
    );
  dispatchEvent(ctx.orgId, ctx.workspaceId, "notification.read", {
    notificationIds,
    userId,
    bulk: true,
  });
};
