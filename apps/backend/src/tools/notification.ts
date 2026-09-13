import { tool, type Tool } from "ai";
import { z } from "zod";
import { db } from "../index.ts";
import {
  createNotification,
  deleteNotification,
  listNotifications,
  updateNotification,
} from "../services/notification.ts";

export function createNotificationTools(
  workspaceId: string,
  agentId: string,
  orgId: string,
): Record<string, Tool> {
  const ctx = { workspaceId, agentId, orgId };
  const create = tool({
    description:
      "Create a notification visible to users in this workspace. Supports minimal markdown in the body.",
    inputSchema: z.object({
      title: z.string().max(200).optional(),
      body: z.string().min(1).max(2000),
    }),
    execute: async ({ title, body }) =>
      createNotification(db, ctx, { title, body }),
  });
  const list = tool({
    description: "List this agent's recent notifications in the workspace.",
    inputSchema: z.object({
      limit: z.number().int().min(1).max(100).optional(),
    }),
    execute: async ({ limit }) => listNotifications(db, ctx, limit ?? 20),
  });
  const update = tool({
    description: "Update a notification this agent created.",
    inputSchema: z.object({
      notificationId: z.string(),
      title: z.string().max(200).optional(),
      body: z.string().min(1).max(2000).optional(),
    }),
    execute: async ({ notificationId, title, body }) => {
      const result = await updateNotification(db, ctx, notificationId, {
        title,
        body,
      });
      return result ?? { error: "Notification not found" };
    },
  });
  const remove = tool({
    description: "Delete a notification this agent created.",
    inputSchema: z.object({ notificationId: z.string() }),
    execute: async ({ notificationId }) => {
      const deleted = await deleteNotification(db, ctx, notificationId);
      return deleted ? { success: true } : { error: "Notification not found" };
    },
  });
  return {
    createNotification: create,
    listNotifications: list,
    updateNotification: update,
    deleteNotification: remove,
  };
}
