# Projectly — Project Management & Team Collaboration

Projectly is a secure, authenticated workspace for team projects, Kanban-style task execution, collaboration comments, notifications, and live project refresh events.

## What is implemented

| Area | Included capability |
|---|---|
| Authentication | Managed OAuth sign-in, protected server procedures, secure session handling, sign-out, and a tailored unauthenticated entry screen. Account registration and recovery remain with the managed identity provider, so credentials are never stored in this app. |
| Projects | Create, edit, delete, search, view progress, set dates, and manage project-scoped roles. |
| Tasks | Create, update, delete, assign, label, prioritize, date, filter, view as board/list, and drag between workflow columns. |
| Collaboration | Project membership with owner/admin/member authorization, rich task detail dialogs, comments, activity history, and in-app notifications. |
| Productivity | Dashboard metrics, My Tasks view, global command-style search, notification inbox, profile preferences, and responsive navigation. |
| Real-time | Socket.IO project refresh broadcasts with authenticated, project-membership-checked room subscriptions. |

## Data model

The database includes `projects`, `projectMembers`, `tasks`, `comments`, `notifications`, `activities`, and `passwordResetTokens` in addition to managed `users`. Project members are authorized server-side on every protected project, task, and comment operation. Task labels are serialized as bounded JSON arrays, and every query is constrained to the authenticated user’s memberships.

## Development

```bash
pnpm dev
pnpm check
pnpm test
pnpm build
```

The app uses the provided managed relational database and tRPC server contracts rather than a separate MongoDB/REST/JWT implementation. This preserves the scaffold’s existing secure OAuth session, typed data flow, and managed hosting compatibility.

## Hosting note for live collaboration

The Socket.IO integration operates in a single process and is ideal during development or on an always-on instance. Standard autoscaling hosting may suspend instances and distribute users across instances, which prevents dependable persistent WebSocket rooms. For durable production real-time collaboration, select the platform’s **always-on Reserved hosting** option before publishing.

## Quality checks

The project includes unit checks for sign-out behavior, project permission logic, and safe label serialization. Run `pnpm check && pnpm test` before release; both passed after implementation.
