import { beforeEach, describe, expect, it, vi } from "vitest";

const authenticateRequestMock = vi.hoisted(() => vi.fn());
const getProjectAccessMock = vi.hoisted(() => vi.fn());

vi.mock("./_core/sdk", () => ({ sdk: { authenticateRequest: authenticateRequestMock } }));
vi.mock("./db", () => ({ getProjectAccess: getProjectAccessMock }));

import { attachRealtimeServer, emitProjectUpdate } from "./realtime";

describe("realtime collaboration authorization", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only joins user and project rooms after session and membership validation", async () => {
    const middleware: Array<(socket: any, next: (error?: Error) => void) => Promise<void>> = [];
    const listeners = new Map<string, (socket: any) => void>();
    const emit = vi.fn();
    const server = {
      use: vi.fn((handler) => middleware.push(handler)),
      on: vi.fn((event, handler) => listeners.set(event, handler)),
      to: vi.fn(() => ({ emit })),
    };
    authenticateRequestMock.mockResolvedValue({ id: 12 });
    attachRealtimeServer(server as never);

    const handlers = new Map<string, (...args: any[]) => void>();
    const socket = { request: {}, data: {}, on: vi.fn((event, handler) => handlers.set(event, handler)), join: vi.fn(), leave: vi.fn() };
    const next = vi.fn();
    await middleware[0](socket, next);
    expect(next).toHaveBeenCalledWith();
    expect(socket.data.userId).toBe(12);

    listeners.get("connection")!(socket);
    handlers.get("join:user")!(99);
    handlers.get("join:user")!(12);
    expect(socket.join).toHaveBeenCalledTimes(1);
    expect(socket.join).toHaveBeenCalledWith("user:12");

    getProjectAccessMock.mockResolvedValueOnce(undefined);
    await handlers.get("join:project")!(6);
    expect(socket.join).toHaveBeenCalledTimes(1);
    getProjectAccessMock.mockResolvedValueOnce({ role: "member" });
    await handlers.get("join:project")!(6);
    expect(socket.join).toHaveBeenCalledWith("project:6");

    emitProjectUpdate(6, "task_updated");
    expect(server.to).toHaveBeenCalledWith("project:6");
    expect(emit).toHaveBeenCalledWith("project:updated", expect.objectContaining({ projectId: 6, event: "task_updated" }));
  });
});
