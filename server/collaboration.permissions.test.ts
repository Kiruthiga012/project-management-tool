import { describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";

const getProjectAccessMock = vi.hoisted(() => vi.fn());

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./db")>();
  return { ...actual, getProjectAccess: getProjectAccessMock };
});

import { collaborationRouter } from "./routers/collaboration";

function createMemberContext(): TrpcContext {
  const now = new Date();
  return {
    user: {
      id: 7,
      openId: "project-member",
      email: "member@example.com",
      name: "Project Member",
      avatar: null,
      loginMethod: "manus",
      role: "user",
      createdAt: now,
      updatedAt: now,
      lastSignedIn: now,
    },
    req: {} as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("collaboration protected procedures", () => {
  it("rejects task creation outside an accessible project before database writes", async () => {
    getProjectAccessMock.mockResolvedValueOnce(undefined);
    const caller = collaborationRouter.createCaller(createMemberContext());

    await expect(caller.tasks.create({ projectId: 999, title: "Restricted task" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You do not have access to this project.",
    });
  });
});
