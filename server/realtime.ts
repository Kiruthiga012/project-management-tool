import type { Server } from "socket.io";
import type { Request } from "express";
import { getProjectAccess } from "./db";
import { sdk } from "./_core/sdk";

let io: Server | null = null;

export function attachRealtimeServer(server: Server) {
  io = server;
  io.use(async (socket, next) => {
    try {
      const user = await sdk.authenticateRequest(socket.request as Request);
      socket.data.userId = user.id;
      next();
    } catch {
      next(new Error("Unauthorized"));
    }
  });
  io.on("connection", (socket) => {
    socket.on("join:user", (userId: number) => {
      if (userId === socket.data.userId) socket.join(`user:${userId}`);
    });
    socket.on("join:project", async (projectId: number) => {
      if (!Number.isInteger(projectId) || projectId <= 0) return;
      const access = await getProjectAccess(projectId, socket.data.userId);
      if (access) socket.join(`project:${projectId}`);
    });
    socket.on("leave:project", (projectId: number) => socket.leave(`project:${projectId}`));
  });
}

export function emitProjectUpdate(projectId: number, event: string) {
  io?.to(`project:${projectId}`).emit("project:updated", { projectId, event, at: Date.now() });
}

export function emitUserUpdate(userId: number, event: string) {
  io?.to(`user:${userId}`).emit("user:updated", { event, at: Date.now() });
}
