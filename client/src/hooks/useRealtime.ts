import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useEffect } from "react";
import { io } from "socket.io-client";

export function useRealtime(projectId?: number) {
  const { user } = useAuth();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!user) return;
    const socket = io({ path: "/api/socket.io", transports: ["websocket", "polling"] });
    socket.emit("join:user", user.id);
    if (projectId) socket.emit("join:project", projectId);
    socket.on("project:updated", (event: { projectId: number }) => {
      if (event.projectId === projectId) void utils.collaboration.projects.get.invalidate({ id: event.projectId });
      void utils.collaboration.dashboard.summary.invalidate();
      void utils.collaboration.projects.list.invalidate();
    });
    socket.on("user:updated", () => void utils.collaboration.notifications.list.invalidate());
    return () => {
      if (projectId) socket.emit("leave:project", projectId);
      socket.disconnect();
    };
  }, [projectId, user?.id, utils]);
}
