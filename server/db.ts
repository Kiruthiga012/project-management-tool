import { and, asc, count, desc, eq, inArray, like, or, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  activities,
  comments,
  InsertUser,
  notifications,
  projectMembers,
  projects,
  tasks,
  users,
} from "../drizzle/schema";
import { ENV } from "./_core/env";

export type ProjectRole = "owner" | "admin" | "member";
export type TaskStatus = "todo" | "in_progress" | "review" | "completed";
export type TaskPriority = "low" | "medium" | "high" | "urgent";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function requireDb() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await requireDb();
  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  const nullableFields = ["name", "email", "avatar", "loginMethod"] as const;

  nullableFields.forEach((field) => {
    if (user[field] !== undefined) {
      const value = user[field] ?? null;
      values[field] = value;
      updateSet[field] = value;
    }
  });

  if (user.role !== undefined) {
    values.role = user.role;
    updateSet.role = user.role;
  } else if (user.openId === ENV.ownerOpenId) {
    values.role = "admin";
    updateSet.role = "admin";
  }

  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getProjectAccess(projectId: number, userId: number) {
  const db = await requireDb();
  const result = await db
    .select({ project: projects, role: projectMembers.role })
    .from(projectMembers)
    .innerJoin(projects, eq(projectMembers.projectId, projects.id))
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  return result[0];
}

export function canManageProject(role: ProjectRole) {
  return role === "owner" || role === "admin";
}

export function decodeLabels(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function encodeLabels(labels: string[]) {
  return JSON.stringify(Array.from(new Set(labels.map((label) => label.trim()).filter(Boolean))).slice(0, 12));
}

export async function addActivity(input: {
  projectId: number;
  taskId?: number | null;
  userId?: number | null;
  action: string;
  description: string;
}) {
  const db = await requireDb();
  await db.insert(activities).values({
    projectId: input.projectId,
    taskId: input.taskId ?? null,
    userId: input.userId ?? null,
    action: input.action,
    description: input.description,
  });
}

export async function addNotification(input: {
  userId: number;
  type: string;
  message: string;
  projectId?: number | null;
  taskId?: number | null;
}) {
  const db = await requireDb();
  await db.insert(notifications).values({
    userId: input.userId,
    type: input.type,
    message: input.message,
    projectId: input.projectId ?? null,
    taskId: input.taskId ?? null,
  });
}

export async function getProjectMembers(projectId: number) {
  const db = await requireDb();
  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatar: users.avatar,
      globalRole: users.role,
      role: projectMembers.role,
      joinedAt: projectMembers.joinedAt,
    })
    .from(projectMembers)
    .innerJoin(users, eq(projectMembers.userId, users.id))
    .where(eq(projectMembers.projectId, projectId));
}

export async function getWorkspaceTasks(projectId: number) {
  const db = await requireDb();
  const taskRows = await db
    .select({
      id: tasks.id,
      projectId: tasks.projectId,
      title: tasks.title,
      description: tasks.description,
      assignedToId: tasks.assignedToId,
      createdById: tasks.createdById,
      status: tasks.status,
      priority: tasks.priority,
      labels: tasks.labels,
      dueDate: tasks.dueDate,
      position: tasks.position,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      assigneeName: users.name,
      assigneeAvatar: users.avatar,
    })
    .from(tasks)
    .leftJoin(users, eq(tasks.assignedToId, users.id))
    .where(eq(tasks.projectId, projectId))
    .orderBy(asc(tasks.status), asc(tasks.position), desc(tasks.updatedAt));

  const ids = taskRows.map((task) => task.id);
  const commentCounts = ids.length
    ? await db
        .select({ taskId: comments.taskId, total: count(comments.id) })
        .from(comments)
        .where(inArray(comments.taskId, ids))
        .groupBy(comments.taskId)
    : [];
  const countByTask = new Map(commentCounts.map((row) => [row.taskId, Number(row.total)]));

  return taskRows.map((task) => ({
    ...task,
    labels: decodeLabels(task.labels),
    commentCount: countByTask.get(task.id) ?? 0,
  }));
}

export async function getProjectProgress(projectId: number) {
  const db = await requireDb();
  const result = await db
    .select({
      total: count(tasks.id),
      completed: sql<number>`COALESCE(SUM(CASE WHEN ${tasks.status} = 'completed' THEN 1 ELSE 0 END), 0)`,
    })
    .from(tasks)
    .where(eq(tasks.projectId, projectId));
  const total = Number(result[0]?.total ?? 0);
  const completed = Number(result[0]?.completed ?? 0);
  return { total, completed, progress: total ? Math.round((completed / total) * 100) : 0 };
}

export async function searchUsers(query: string, excludedUserIds: number[] = []) {
  const db = await requireDb();
  const pattern = `%${query.trim()}%`;
  const rows = await db
    .select({ id: users.id, name: users.name, email: users.email, avatar: users.avatar })
    .from(users)
    .where(and(or(like(users.email, pattern), like(users.name, pattern)), excludedUserIds.length ? sql`${users.id} NOT IN (${sql.join(excludedUserIds.map((id) => sql`${id}`), sql`, `)})` : undefined))
    .limit(12);
  return rows;
}
