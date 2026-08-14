import { TRPCError } from "@trpc/server";
import { and, asc, count, desc, eq, gte, inArray, like, lte, or, sql } from "drizzle-orm";
import { activities, comments, notifications, projectMembers, projects, tasks, users } from "../../drizzle/schema";
import {
  addActivity,
  addNotification,
  canManageProject,
  decodeLabels,
  encodeLabels,
  getProjectAccess,
  getProjectMembers,
  getProjectProgress,
  getWorkspaceTasks,
  requireDb,
  searchUsers,
  TaskPriority,
  TaskStatus,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { emitProjectUpdate, emitUserUpdate } from "../realtime";
import { z } from "zod";

const projectRoleSchema = z.enum(["owner", "admin", "member"]);
const taskStatusSchema = z.enum(["todo", "in_progress", "review", "completed"]);
const prioritySchema = z.enum(["low", "medium", "high", "urgent"]);
const dateInput = z.date().nullable().optional();

async function memberAccess(projectId: number, userId: number) {
  const access = await getProjectAccess(projectId, userId);
  if (!access) throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this project." });
  return access;
}

async function managerAccess(projectId: number, userId: number) {
  const access = await memberAccess(projectId, userId);
  if (!canManageProject(access.role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only project owners and admins can manage this project." });
  }
  return access;
}

async function assertProjectMember(projectId: number, userId: number) {
  const db = await requireDb();
  const result = await db
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  if (!result[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Assignee must be a member of this project." });
}

function taskTitle(task: { title: string }) {
  return `“${task.title}”`;
}

export const collaborationRouter = router({
  dashboard: router({
    summary: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const userId = ctx.user.id;
      const membershipRows = await db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(eq(projectMembers.userId, userId));
      const projectIds = membershipRows.map((row) => row.projectId);
      const now = new Date();
      const assigned = await db
        .select({
          total: count(tasks.id),
          completed: sql<number>`COALESCE(SUM(CASE WHEN ${tasks.status} = 'completed' THEN 1 ELSE 0 END), 0)`,
          overdue: sql<number>`COALESCE(SUM(CASE WHEN ${tasks.dueDate} < ${now} AND ${tasks.status} <> 'completed' THEN 1 ELSE 0 END), 0)`,
        })
        .from(tasks)
        .where(eq(tasks.assignedToId, userId));
      const recentProjects = projectIds.length
        ? await db
            .select({ project: projects, role: projectMembers.role })
            .from(projectMembers)
            .innerJoin(projects, eq(projectMembers.projectId, projects.id))
            .where(eq(projectMembers.userId, userId))
            .orderBy(desc(projects.updatedAt))
            .limit(4)
        : [];
      const myTasks = await db
        .select({ task: tasks, projectName: projects.name })
        .from(tasks)
        .innerJoin(projects, eq(tasks.projectId, projects.id))
        .where(eq(tasks.assignedToId, userId))
        .orderBy(desc(tasks.updatedAt))
        .limit(6);
      const activityRows = projectIds.length
        ? await db
            .select({ activity: activities, name: users.name })
            .from(activities)
            .leftJoin(users, eq(activities.userId, users.id))
            .where(inArray(activities.projectId, projectIds))
            .orderBy(desc(activities.createdAt))
            .limit(8)
        : [];
      const decoratedProjects = await Promise.all(
        recentProjects.map(async ({ project, role }) => ({ ...project, role, ...(await getProjectProgress(project.id)) })),
      );
      return {
        stats: {
          totalProjects: projectIds.length,
          activeTasks: Number(assigned[0]?.total ?? 0) - Number(assigned[0]?.completed ?? 0),
          completedTasks: Number(assigned[0]?.completed ?? 0),
          overdueTasks: Number(assigned[0]?.overdue ?? 0),
        },
        recentProjects: decoratedProjects,
        myTasks: myTasks.map(({ task, projectName }) => ({ ...task, labels: decodeLabels(task.labels), projectName })),
        activities: activityRows.map(({ activity, name }) => ({ ...activity, userName: name })),
      };
    }),
  }),

  projects: router({
    list: protectedProcedure.input(z.object({ search: z.string().trim().max(120).optional() }).optional()).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const conditions = [eq(projectMembers.userId, ctx.user.id)];
      if (input?.search) {
        const pattern = `%${input.search}%`;
        conditions.push(or(like(projects.name, pattern), like(projects.description, pattern))!);
      }
      const rows = await db
        .select({ project: projects, role: projectMembers.role })
        .from(projectMembers)
        .innerJoin(projects, eq(projectMembers.projectId, projects.id))
        .where(and(...conditions))
        .orderBy(desc(projects.updatedAt));
      return Promise.all(rows.map(async ({ project, role }) => ({ ...project, role, ...(await getProjectProgress(project.id)) })));
    }),

    create: protectedProcedure.input(z.object({
      name: z.string().trim().min(2).max(180),
      description: z.string().trim().max(5000).optional(),
      startDate: dateInput,
      dueDate: dateInput,
    }).refine((input) => !input.startDate || !input.dueDate || input.dueDate >= input.startDate, { message: "Due date must be after start date.", path: ["dueDate"] }))
      .mutation(async ({ ctx, input }) => {
        const db = await requireDb();
        const result = await db.insert(projects).values({
          name: input.name,
          description: input.description || null,
          ownerId: ctx.user.id,
          startDate: input.startDate ?? null,
          dueDate: input.dueDate ?? null,
        });
        const projectId = Number(result[0].insertId);
        await db.insert(projectMembers).values({ projectId, userId: ctx.user.id, role: "owner" });
        await addActivity({ projectId, userId: ctx.user.id, action: "project_created", description: `${ctx.user.name || "A team member"} created this project.` });
        emitProjectUpdate(projectId, "project_created");
        return { id: projectId };
      }),

    get: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const access = await memberAccess(input.id, ctx.user.id);
      const db = await requireDb();
      const [members, workspaceTasks, progress, activityRows] = await Promise.all([
        getProjectMembers(input.id),
        getWorkspaceTasks(input.id),
        getProjectProgress(input.id),
        db
          .select({ activity: activities, userName: users.name })
          .from(activities)
          .leftJoin(users, eq(activities.userId, users.id))
          .where(eq(activities.projectId, input.id))
          .orderBy(desc(activities.createdAt))
          .limit(50),
      ]);
      return {
        project: { ...access.project, accessRole: access.role, ...progress },
        members,
        tasks: workspaceTasks,
        activities: activityRows.map(({ activity, userName }) => ({ ...activity, userName })),
      };
    }),

    update: protectedProcedure.input(z.object({
      id: z.number().int().positive(),
      name: z.string().trim().min(2).max(180).optional(),
      description: z.string().trim().max(5000).nullable().optional(),
      startDate: dateInput,
      dueDate: dateInput,
    })).mutation(async ({ ctx, input }) => {
      await managerAccess(input.id, ctx.user.id);
      const db = await requireDb();
      const { id, ...changes } = input;
      await db.update(projects).set(changes).where(eq(projects.id, id));
      await addActivity({ projectId: id, userId: ctx.user.id, action: "project_updated", description: `${ctx.user.name || "A team member"} updated project details.` });
      emitProjectUpdate(id, "project_updated");
      return { success: true };
    }),

    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const access = await memberAccess(input.id, ctx.user.id);
      if (access.role !== "owner") throw new TRPCError({ code: "FORBIDDEN", message: "Only the project owner can delete this project." });
      const db = await requireDb();
      await db.delete(projects).where(eq(projects.id, input.id));
      emitProjectUpdate(input.id, "project_deleted");
      return { success: true };
    }),

    memberSearch: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), query: z.string().trim().min(2).max(120) })).query(async ({ ctx, input }) => {
      await managerAccess(input.projectId, ctx.user.id);
      const members = await getProjectMembers(input.projectId);
      return searchUsers(input.query, members.map((member) => member.id));
    }),

    addMember: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), userId: z.number().int().positive(), role: projectRoleSchema.exclude(["owner"]).default("member") })).mutation(async ({ ctx, input }) => {
      await managerAccess(input.projectId, ctx.user.id);
      const db = await requireDb();
      const target = await db.select({ id: users.id, name: users.name }).from(users).where(eq(users.id, input.userId)).limit(1);
      if (!target[0]) throw new TRPCError({ code: "NOT_FOUND", message: "The selected user could not be found." });
      await db.insert(projectMembers).values({ projectId: input.projectId, userId: input.userId, role: input.role }).onDuplicateKeyUpdate({ set: { role: input.role } });
      await addActivity({ projectId: input.projectId, userId: ctx.user.id, action: "member_added", description: `${ctx.user.name || "A project admin"} added ${target[0].name || "a teammate"} to the project.` });
      if (input.userId !== ctx.user.id) await addNotification({ userId: input.userId, type: "project_invite", message: `You were added to a project by ${ctx.user.name || "a teammate"}.`, projectId: input.projectId });
      emitProjectUpdate(input.projectId, "member_added");
      emitUserUpdate(input.userId, "project_invite");
      return { success: true };
    }),

    updateMemberRole: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), userId: z.number().int().positive(), role: projectRoleSchema.exclude(["owner"]) })).mutation(async ({ ctx, input }) => {
      const access = await managerAccess(input.projectId, ctx.user.id);
      if (access.role !== "owner" && input.role === "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Only an owner can promote a member to admin." });
      const db = await requireDb();
      await db.update(projectMembers).set({ role: input.role }).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, input.userId)));
      emitProjectUpdate(input.projectId, "member_role_updated");
      return { success: true };
    }),

    removeMember: protectedProcedure.input(z.object({ projectId: z.number().int().positive(), userId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      await managerAccess(input.projectId, ctx.user.id);
      const db = await requireDb();
      const target = await db.select({ role: projectMembers.role }).from(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, input.userId))).limit(1);
      if (!target[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Project member not found." });
      if (target[0].role === "owner") throw new TRPCError({ code: "BAD_REQUEST", message: "Transfer ownership before removing the owner." });
      await db.delete(projectMembers).where(and(eq(projectMembers.projectId, input.projectId), eq(projectMembers.userId, input.userId)));
      await addActivity({ projectId: input.projectId, userId: ctx.user.id, action: "member_removed", description: `${ctx.user.name || "A project admin"} removed a member from the project.` });
      emitProjectUpdate(input.projectId, "member_removed");
      return { success: true };
    }),
  }),

  tasks: router({
    create: protectedProcedure.input(z.object({
      projectId: z.number().int().positive(),
      title: z.string().trim().min(2).max(240),
      description: z.string().trim().max(10000).optional(),
      assignedToId: z.number().int().positive().nullable().optional(),
      status: taskStatusSchema.default("todo"),
      priority: prioritySchema.default("medium"),
      dueDate: dateInput,
      labels: z.array(z.string().trim().min(1).max(32)).max(12).default([]),
    })).mutation(async ({ ctx, input }) => {
      await memberAccess(input.projectId, ctx.user.id);
      if (input.assignedToId) await assertProjectMember(input.projectId, input.assignedToId);
      const db = await requireDb();
      const last = await db.select({ position: tasks.position }).from(tasks).where(and(eq(tasks.projectId, input.projectId), eq(tasks.status, input.status))).orderBy(desc(tasks.position)).limit(1);
      const result = await db.insert(tasks).values({
        projectId: input.projectId,
        title: input.title,
        description: input.description || null,
        assignedToId: input.assignedToId ?? null,
        createdById: ctx.user.id,
        status: input.status,
        priority: input.priority,
        dueDate: input.dueDate ?? null,
        labels: encodeLabels(input.labels),
        position: (last[0]?.position ?? -1) + 1,
      });
      const taskId = Number(result[0].insertId);
      await addActivity({ projectId: input.projectId, taskId, userId: ctx.user.id, action: "task_created", description: `${ctx.user.name || "A team member"} created ${taskTitle(input)}.` });
      if (input.assignedToId && input.assignedToId !== ctx.user.id) await addNotification({ userId: input.assignedToId, type: "task_assigned", message: `${ctx.user.name || "A teammate"} assigned you ${taskTitle(input)}.`, projectId: input.projectId, taskId });
      emitProjectUpdate(input.projectId, "task_created");
      if (input.assignedToId) emitUserUpdate(input.assignedToId, "task_assigned");
      return { id: taskId };
    }),

    update: protectedProcedure.input(z.object({
      id: z.number().int().positive(),
      title: z.string().trim().min(2).max(240).optional(),
      description: z.string().trim().max(10000).nullable().optional(),
      assignedToId: z.number().int().positive().nullable().optional(),
      status: taskStatusSchema.optional(),
      priority: prioritySchema.optional(),
      dueDate: dateInput,
      labels: z.array(z.string().trim().min(1).max(32)).max(12).optional(),
    })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const current = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1);
      if (!current[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      await memberAccess(current[0].projectId, ctx.user.id);
      if (input.assignedToId) await assertProjectMember(current[0].projectId, input.assignedToId);
      const { id, labels, ...changes } = input;
      await db.update(tasks).set({ ...changes, ...(labels !== undefined ? { labels: encodeLabels(labels) } : {}) }).where(eq(tasks.id, id));
      const changedStatus = input.status && input.status !== current[0].status;
      const changedAssignee = input.assignedToId !== undefined && input.assignedToId !== current[0].assignedToId;
      if (changedStatus) await addActivity({ projectId: current[0].projectId, taskId: id, userId: ctx.user.id, action: "status_changed", description: `${ctx.user.name || "A team member"} moved ${taskTitle(current[0])} to ${input.status!.replace("_", " ")}.` });
      if (changedAssignee && input.assignedToId && input.assignedToId !== ctx.user.id) await addNotification({ userId: input.assignedToId, type: "task_assigned", message: `${ctx.user.name || "A teammate"} assigned you ${taskTitle(current[0])}.`, projectId: current[0].projectId, taskId: id });
      emitProjectUpdate(current[0].projectId, "task_updated");
      if (changedAssignee && input.assignedToId) emitUserUpdate(input.assignedToId, "task_assigned");
      return { success: true };
    }),

    move: protectedProcedure.input(z.object({ id: z.number().int().positive(), status: taskStatusSchema, position: z.number().int().min(0) })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const current = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1);
      if (!current[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      await memberAccess(current[0].projectId, ctx.user.id);
      await db.update(tasks).set({ status: input.status, position: input.position }).where(eq(tasks.id, input.id));
      if (current[0].status !== input.status) await addActivity({ projectId: current[0].projectId, taskId: input.id, userId: ctx.user.id, action: "status_changed", description: `${ctx.user.name || "A team member"} moved ${taskTitle(current[0])} to ${input.status.replace("_", " ")}.` });
      emitProjectUpdate(current[0].projectId, "task_moved");
      return { success: true };
    }),

    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const current = await db.select().from(tasks).where(eq(tasks.id, input.id)).limit(1);
      if (!current[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      const access = await memberAccess(current[0].projectId, ctx.user.id);
      if (current[0].createdById !== ctx.user.id && !canManageProject(access.role)) throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete tasks you created unless you are an admin." });
      await db.delete(tasks).where(eq(tasks.id, input.id));
      await addActivity({ projectId: current[0].projectId, userId: ctx.user.id, action: "task_deleted", description: `${ctx.user.name || "A team member"} deleted ${taskTitle(current[0])}.` });
      emitProjectUpdate(current[0].projectId, "task_deleted");
      return { success: true };
    }),

    details: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const task = await db.select({ task: tasks, assigneeName: users.name, assigneeAvatar: users.avatar }).from(tasks).leftJoin(users, eq(tasks.assignedToId, users.id)).where(eq(tasks.id, input.id)).limit(1);
      if (!task[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      await memberAccess(task[0].task.projectId, ctx.user.id);
      const commentRows = await db.select({ comment: comments, userName: users.name, avatar: users.avatar }).from(comments).innerJoin(users, eq(comments.userId, users.id)).where(eq(comments.taskId, input.id)).orderBy(asc(comments.createdAt));
      return { task: { ...task[0].task, labels: decodeLabels(task[0].task.labels), assigneeName: task[0].assigneeName, assigneeAvatar: task[0].assigneeAvatar }, comments: commentRows.map(({ comment, userName, avatar }) => ({ ...comment, userName, avatar })) };
    }),
  }),

  comments: router({
    create: protectedProcedure.input(z.object({ taskId: z.number().int().positive(), content: z.string().trim().min(1).max(5000) })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const task = await db.select().from(tasks).where(eq(tasks.id, input.taskId)).limit(1);
      if (!task[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found." });
      await memberAccess(task[0].projectId, ctx.user.id);
      const result = await db.insert(comments).values({ taskId: input.taskId, userId: ctx.user.id, content: input.content });
      const commentId = Number(result[0].insertId);
      await addActivity({ projectId: task[0].projectId, taskId: input.taskId, userId: ctx.user.id, action: "comment_added", description: `${ctx.user.name || "A team member"} commented on ${taskTitle(task[0])}.` });
      if (task[0].assignedToId && task[0].assignedToId !== ctx.user.id) await addNotification({ userId: task[0].assignedToId, type: "task_comment", message: `${ctx.user.name || "A teammate"} commented on ${taskTitle(task[0])}.`, projectId: task[0].projectId, taskId: input.taskId });
      emitProjectUpdate(task[0].projectId, "comment_created");
      if (task[0].assignedToId) emitUserUpdate(task[0].assignedToId, "task_comment");
      return { id: commentId };
    }),
    update: protectedProcedure.input(z.object({ id: z.number().int().positive(), content: z.string().trim().min(1).max(5000) })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const row = await db.select().from(comments).where(eq(comments.id, input.id)).limit(1);
      if (!row[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found." });
      if (row[0].userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You can only edit your own comments." });
      await db.update(comments).set({ content: input.content }).where(eq(comments.id, input.id));
      return { success: true };
    }),
    remove: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const row = await db.select().from(comments).where(eq(comments.id, input.id)).limit(1);
      if (!row[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Comment not found." });
      if (row[0].userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "You can only delete your own comments." });
      await db.delete(comments).where(eq(comments.id, input.id));
      return { success: true };
    }),
  }),

  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const rows = await db.select().from(notifications).where(eq(notifications.userId, ctx.user.id)).orderBy(desc(notifications.createdAt)).limit(40);
      return { items: rows, unreadCount: rows.filter((item) => item.isRead === 0).length };
    }),
    markRead: protectedProcedure.input(z.object({ id: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.update(notifications).set({ isRead: 1 }).where(and(eq(notifications.id, input.id), eq(notifications.userId, ctx.user.id)));
      return { success: true };
    }),
    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      const db = await requireDb();
      await db.update(notifications).set({ isRead: 1 }).where(eq(notifications.userId, ctx.user.id));
      return { success: true };
    }),
  }),

  users: router({
    profile: protectedProcedure.query(async ({ ctx }) => {
      const db = await requireDb();
      const row = await db.select({ id: users.id, name: users.name, email: users.email, avatar: users.avatar, role: users.role, createdAt: users.createdAt }).from(users).where(eq(users.id, ctx.user.id)).limit(1);
      return row[0] ?? ctx.user;
    }),
    updateProfile: protectedProcedure.input(z.object({ name: z.string().trim().min(2).max(140).optional(), avatar: z.string().url().max(2048).nullable().optional() })).mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      await db.update(users).set(input).where(eq(users.id, ctx.user.id));
      return { success: true };
    }),
    globalSearch: protectedProcedure.input(z.object({ query: z.string().trim().min(2).max(120) })).query(async ({ ctx, input }) => {
      const db = await requireDb();
      const pattern = `%${input.query}%`;
      const memberships = await db.select({ projectId: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, ctx.user.id));
      const projectIds = memberships.map((member) => member.projectId);
      const foundProjects = projectIds.length ? await db.select({ id: projects.id, name: projects.name, description: projects.description }).from(projects).where(and(inArray(projects.id, projectIds), or(like(projects.name, pattern), like(projects.description, pattern)))).limit(8) : [];
      const foundTasks = projectIds.length ? await db.select({ id: tasks.id, title: tasks.title, projectId: tasks.projectId, projectName: projects.name, status: tasks.status, priority: tasks.priority }).from(tasks).innerJoin(projects, eq(tasks.projectId, projects.id)).where(and(inArray(tasks.projectId, projectIds), or(like(tasks.title, pattern), like(tasks.description, pattern)))).limit(12) : [];
      const foundMembers = await searchUsers(input.query);
      return { projects: foundProjects, tasks: foundTasks, members: foundMembers };
    }),
  }),
});
