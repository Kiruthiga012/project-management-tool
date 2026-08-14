import { useAuth } from "@/_core/hooks/useAuth";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate, taskStatusLabel } from "@/lib/format";
import { trpc } from "@/lib/trpc";
import { useRealtime } from "@/hooks/useRealtime";
import { AlertTriangle, ArrowRight, CheckCircle2, CircleDotDashed, Clock3, FolderKanban, ListChecks, Plus, TrendingUp } from "lucide-react";
import { useLocation } from "wouter";

const statusTone: Record<string, string> = { todo: "bg-slate-100 text-slate-600", in_progress: "bg-blue-50 text-blue-700", review: "bg-amber-50 text-amber-700", completed: "bg-emerald-50 text-emerald-700" };
const priorityTone: Record<string, string> = { low: "text-slate-500", medium: "text-blue-600", high: "text-amber-600", urgent: "text-rose-600" };

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  useRealtime();
  const summary = trpc.collaboration.dashboard.summary.useQuery();
  const data = summary.data;
  const cards = [
    { label: "Total projects", value: data?.stats.totalProjects ?? 0, icon: FolderKanban, iconClass: "bg-blue-50 text-blue-600" },
    { label: "Active tasks", value: data?.stats.activeTasks ?? 0, icon: CircleDotDashed, iconClass: "bg-violet-50 text-violet-600" },
    { label: "Completed", value: data?.stats.completedTasks ?? 0, icon: CheckCircle2, iconClass: "bg-emerald-50 text-emerald-600" },
    { label: "Overdue", value: data?.stats.overdueTasks ?? 0, icon: AlertTriangle, iconClass: "bg-rose-50 text-rose-600" },
  ];

  return <div className="space-y-8">
    <section className="flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
      <div><p className="mb-2 text-sm font-semibold text-[#2457d6]">YOUR WORKSPACE</p><h1 className="font-display text-3xl font-extrabold tracking-tight text-slate-950 sm:text-4xl">Good morning, {user?.name?.split(" ")[0] || "there"}.</h1><p className="mt-2 max-w-xl text-slate-500">Here’s a focused view of what needs your attention today.</p></div>
      <Button onClick={() => setLocation("/projects")} className="h-11 rounded-xl bg-[#2457d6] px-5 shadow-lg shadow-blue-200 hover:bg-[#1f4bc0]"><Plus className="mr-2 h-4 w-4" />New project</Button>
    </section>
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, icon: Icon, iconClass }) => <div key={label} className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm"><div className="flex items-start justify-between"><div><p className="text-sm font-medium text-slate-500">{label}</p>{summary.isLoading ? <Skeleton className="mt-3 h-9 w-16" /> : <p className="mt-2 font-display text-3xl font-extrabold">{value}</p>}</div><div className={`grid h-10 w-10 place-items-center rounded-xl ${iconClass}`}><Icon className="h-5 w-5" /></div></div><p className="mt-4 flex items-center gap-1 text-xs font-medium text-slate-400"><TrendingUp className="h-3.5 w-3.5" />Updated live from your workspace</p></div>)}</section>
    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(340px,.65fr)]">
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div><h2 className="font-display text-lg font-bold">Recent projects</h2><p className="mt-0.5 text-sm text-slate-500">Keep momentum across your active work.</p></div><button onClick={() => setLocation("/projects")} className="flex items-center gap-1 text-sm font-semibold text-[#2457d6] hover:text-[#1f4bc0]">View all <ArrowRight className="h-4 w-4" /></button></div>
        <div className="divide-y divide-slate-100">{summary.isLoading ? Array.from({ length: 3 }).map((_, index) => <div className="flex gap-4 p-6" key={index}><Skeleton className="h-10 w-10 rounded-xl" /><div className="flex-1 space-y-2"><Skeleton className="h-4 w-36" /><Skeleton className="h-3 w-3/4" /></div></div>) : data?.recentProjects.length ? data.recentProjects.map((project) => <button key={project.id} onClick={() => setLocation(`/projects/${project.id}`)} className="flex w-full items-center gap-4 px-6 py-4 text-left transition hover:bg-slate-50"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-blue-50 font-display text-sm font-extrabold text-[#2457d6]">{project.name.slice(0, 2).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate font-semibold">{project.name}</p><Badge variant="secondary" className="rounded-md bg-slate-100 text-[10px] capitalize text-slate-600">{project.role}</Badge></div><p className="mt-1 truncate text-sm text-slate-500">{project.description || "No description added yet."}</p><div className="mt-3 flex items-center gap-3"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-[#2457d6]" style={{ width: `${project.progress}%` }} /></div><span className="text-xs font-bold text-slate-500">{project.progress}%</span></div></div><div className="hidden shrink-0 text-right sm:block"><p className="text-xs font-semibold text-slate-500">{project.total} tasks</p><p className="mt-1 text-xs text-slate-400">{formatDate(project.dueDate)}</p></div></button>) : <EmptyInline icon={FolderKanban} title="No projects yet" description="Create your first project to start collaborating." action={() => setLocation("/projects")} actionLabel="Create project" />}</div>
      </div>
      <div className="rounded-2xl border border-slate-200/80 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div><h2 className="font-display text-lg font-bold">My tasks</h2><p className="mt-0.5 text-sm text-slate-500">Assigned to you.</p></div><Clock3 className="h-5 w-5 text-slate-400" /></div><div className="divide-y divide-slate-100">{summary.isLoading ? Array.from({ length: 4 }).map((_, index) => <div className="p-5" key={index}><Skeleton className="h-4 w-3/4" /><Skeleton className="mt-2 h-3 w-1/2" /></div>) : data?.myTasks.length ? data.myTasks.map((task) => <button key={task.id} onClick={() => setLocation(`/projects/${task.projectId}?task=${task.id}`)} className="block w-full p-5 text-left hover:bg-slate-50"><div className="flex gap-2"><p className="min-w-0 flex-1 truncate text-sm font-semibold text-slate-800">{task.title}</p><span className={`text-xs font-bold ${priorityTone[task.priority]}`}>{task.priority}</span></div><p className="mt-1 text-xs text-slate-500">{task.projectName}</p><div className="mt-3 flex items-center gap-2"><Badge className={`rounded-md border-0 px-2 py-0.5 text-[10px] ${statusTone[task.status]}`}>{taskStatusLabel(task.status)}</Badge><span className="text-xs text-slate-400">{formatDate(task.dueDate)}</span></div></button>) : <EmptyInline icon={ListChecks} title="No tasks assigned" description="Your assigned work will appear here." />}</div></div>
    </section>
    <section className="rounded-2xl border border-slate-200/80 bg-white shadow-sm"><div className="border-b border-slate-100 px-6 py-5"><h2 className="font-display text-lg font-bold">Recent activity</h2></div><div className="grid gap-0 md:grid-cols-2">{data?.activities.length ? data.activities.map((activity) => <div key={activity.id} className="flex gap-3 border-b border-slate-100 p-5 last:border-0 md:nth-[2n+1]:border-r"><div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#8aa7ee]" /><div><p className="text-sm leading-5 text-slate-700">{activity.description}</p><p className="mt-1 text-xs text-slate-400">{formatDate(activity.createdAt)}</p></div></div>) : <div className="p-7 text-sm text-slate-500">Project activity will appear here as your team starts working.</div>}</div></section>
  </div>;
}

function EmptyInline({ icon: Icon, title, description, action, actionLabel }: { icon: typeof FolderKanban; title: string; description: string; action?: () => void; actionLabel?: string }) {
  return <div className="flex flex-col items-center px-6 py-10 text-center"><div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-500"><Icon className="h-5 w-5" /></div><p className="font-semibold">{title}</p><p className="mt-1 max-w-xs text-sm text-slate-500">{description}</p>{action && <Button variant="outline" onClick={action} className="mt-4 rounded-xl">{actionLabel}</Button>}</div>;
}
