import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { initials } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { Search, UserPlus, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

export default function Team() {
  const utils = trpc.useUtils();
  const [projectId, setProjectId] = useState("");
  const [query, setQuery] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const { data: projects } = trpc.collaboration.projects.list.useQuery();
  useEffect(() => { if (!projectId && projects?.[0]) setProjectId(String(projects[0].id)); }, [projectId, projects]);
  const numericId = Number(projectId);
  const workspace = trpc.collaboration.projects.get.useQuery({ id: numericId }, { enabled: Boolean(numericId) });
  const search = trpc.collaboration.projects.memberSearch.useQuery({ projectId: numericId, query }, { enabled: Boolean(numericId) && query.trim().length >= 2 });
  const refresh = () => void utils.collaboration.projects.get.invalidate({ id: numericId });
  const add = trpc.collaboration.projects.addMember.useMutation({ onSuccess: () => { toast.success("Member added"); setQuery(""); setSelectedUserId(""); refresh(); }, onError: (error) => toast.error(error.message) });
  const remove = trpc.collaboration.projects.removeMember.useMutation({ onSuccess: () => { toast.success("Member removed"); refresh(); }, onError: (error) => toast.error(error.message) });
  const updateRole = trpc.collaboration.projects.updateMemberRole.useMutation({ onSuccess: () => { toast.success("Member role updated"); refresh(); }, onError: (error) => toast.error(error.message) });
  const canManage = workspace.data?.project.accessRole !== "member";
  const canChangeRoles = workspace.data?.project.accessRole === "owner";

  return <div className="mx-auto max-w-4xl space-y-7">
    <div><p className="text-sm font-semibold text-[#2457d6]">TEAM</p><h1 className="mt-1 font-display text-3xl font-extrabold tracking-tight">Your project people.</h1><p className="mt-2 text-slate-500">Choose a project to view members and invite authenticated teammates by name or email.</p></div>
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="grid gap-4 md:grid-cols-[220px_1fr]"><div className="grid gap-2"><Label>Project workspace</Label><Select value={projectId} onValueChange={setProjectId}><SelectTrigger className="rounded-xl"><SelectValue placeholder="Select a project" /></SelectTrigger><SelectContent>{projects?.map((project) => <SelectItem value={String(project.id)} key={project.id}>{project.name}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Invite existing user</Label><div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input value={query} onChange={(event) => { setQuery(event.target.value); setSelectedUserId(""); }} placeholder="Search by registered name or email…" className="rounded-xl pl-9" />{search.data?.length ? <div className="absolute z-20 mt-1 w-full rounded-xl border border-slate-200 bg-white p-1 shadow-xl">{search.data.map((user) => <button key={user.id} onClick={() => { setSelectedUserId(String(user.id)); setQuery(user.email || user.name || ""); }} className="block w-full rounded-lg px-3 py-2 text-left hover:bg-slate-50"><p className="text-sm font-medium">{user.name || "Team member"}</p><p className="text-xs text-slate-500">{user.email}</p></button>)}</div> : null}</div></div></div>
      <div className="mt-4 flex flex-wrap items-end gap-3"><div className="grid gap-2"><Label>Project role</Label><Select value={role} onValueChange={(value) => setRole(value as "admin" | "member")}><SelectTrigger className="w-36 rounded-xl"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="member">Member</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select></div><Button disabled={!selectedUserId || add.isPending || !canManage} onClick={() => add.mutate({ projectId: numericId, userId: Number(selectedUserId), role })} className="rounded-xl bg-[#2457d6]"><UserPlus className="mr-2 h-4 w-4" />Add member</Button></div>
    </div>
    <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">{workspace.data?.members.length ? workspace.data.members.map((member) => <div key={member.id} className="flex flex-wrap items-center gap-4 border-b border-slate-100 p-5 last:border-0"><Avatar className="h-10 w-10"><AvatarImage src={member.avatar || undefined} /><AvatarFallback className="bg-slate-100 text-xs font-bold text-slate-600">{initials(member.name)}</AvatarFallback></Avatar><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{member.name || "Team member"}</p><p className="truncate text-xs text-slate-500">{member.email}</p></div>{member.role === "owner" ? <span className="rounded-md bg-violet-50 px-2 py-1 text-xs font-semibold capitalize text-violet-700">owner</span> : canChangeRoles ? <Select value={member.role} onValueChange={(value) => updateRole.mutate({ projectId: numericId, userId: member.id, role: value as "admin" | "member" })}><SelectTrigger className="h-8 w-28 rounded-lg text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="member">Member</SelectItem><SelectItem value="admin">Admin</SelectItem></SelectContent></Select> : <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-semibold capitalize text-slate-600">{member.role}</span>}{canManage && member.role !== "owner" && <Button variant="ghost" size="sm" onClick={() => { if (confirm("Remove this member from the project?")) remove.mutate({ projectId: numericId, userId: member.id }); }} className="text-rose-600 hover:bg-rose-50 hover:text-rose-700">Remove</Button>}</div>) : <div className="flex flex-col items-center p-12 text-center"><Users className="h-7 w-7 text-slate-400" /><p className="mt-4 font-semibold">Select a project to manage its people.</p></div>}</div>
  </div>;
}
