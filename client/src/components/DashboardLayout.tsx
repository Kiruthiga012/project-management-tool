import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Search,
  Settings,
  Users,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from "./DashboardLayoutSkeleton";

const navItems = [
  { icon: LayoutDashboard, label: "Dashboard", path: "/" },
  { icon: FolderKanban, label: "Projects", path: "/projects" },
  { icon: ListChecks, label: "My tasks", path: "/my-tasks" },
  { icon: Users, label: "Team", path: "/team" },
  { icon: Bell, label: "Notifications", path: "/notifications" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

function initials(name?: string | null) {
  return (name || "U").split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase();
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();
  const notificationQuery = trpc.collaboration.notifications.list.useQuery(undefined, { enabled: Boolean(user) });
  const searchQuery = trpc.collaboration.users.globalSearch.useQuery({ query: search.trim() }, { enabled: search.trim().length >= 2 });
  const markAllRead = trpc.collaboration.notifications.markAllRead.useMutation({ onSuccess: () => utils.collaboration.notifications.list.invalidate() });

  useEffect(() => setMobileOpen(false), [location]);

  if (loading) return <DashboardLayoutSkeleton />;
  if (!user) return <AuthWelcome />;

  const navigate = (path: string) => {
    setLocation(path);
    setSearch("");
  };

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-slate-900">
      {mobileOpen && <button onClick={() => setMobileOpen(false)} aria-label="Close navigation" className="fixed inset-0 z-40 bg-slate-950/30 lg:hidden" />}
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col border-r border-slate-200/80 bg-white px-4 py-5 shadow-xl shadow-slate-900/5 transition-transform duration-200 lg:translate-x-0 lg:shadow-none", mobileOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="mb-8 flex items-center justify-between px-2">
          <button onClick={() => navigate("/")} className="flex items-center gap-3 text-left">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#2457d6] text-lg font-bold text-white shadow-lg shadow-blue-200">P</div>
            <div><p className="font-display text-lg font-bold tracking-tight">Projectly</p><p className="text-xs text-slate-500">Team workspace</p></div>
          </button>
          <button onClick={() => setMobileOpen(false)} className="rounded-lg p-2 text-slate-500 lg:hidden"><X className="h-5 w-5" /></button>
        </div>
        <nav className="space-y-1" aria-label="Application navigation">
          {navItems.map(({ icon: Icon, label, path }) => {
            const active = path === "/" ? location === "/" : location === path || location.startsWith(`${path}/`);
            return <button key={path} onClick={() => navigate(path)} className={cn("flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium transition", active ? "bg-blue-50 text-[#2457d6]" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}><Icon className="h-[18px] w-[18px]" />{label}</button>;
          })}
        </nav>
        <div className="mt-auto rounded-2xl bg-slate-50 p-3">
          <button onClick={() => navigate("/profile")} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white">
            <Avatar className="h-9 w-9"><AvatarImage src={(user as { avatar?: string | null }).avatar ?? undefined} /><AvatarFallback className="bg-blue-100 text-xs font-bold text-[#2457d6]">{initials(user.name)}</AvatarFallback></Avatar>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{user.name || "Your workspace"}</p><p className="truncate text-xs text-slate-500">{user.email || "Signed in"}</p></div>
          </button>
          <button onClick={logout} className="mt-1 flex w-full items-center gap-2 rounded-xl px-2 py-2 text-sm font-medium text-slate-500 hover:bg-white hover:text-rose-600"><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      </aside>

      <div className="min-h-screen lg:pl-[272px]">
        <header className="sticky top-0 z-30 flex h-[72px] items-center gap-3 border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-xl sm:px-7">
          <button onClick={() => setMobileOpen(true)} className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 lg:hidden"><Menu className="h-5 w-5" /></button>
          <div className="relative max-w-xl flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search projects, tasks, or people…" className="h-10 border-slate-200 bg-slate-50 pl-9 text-sm shadow-none focus-visible:bg-white" />
            {search.trim().length >= 2 && <div className="absolute left-0 right-0 top-[46px] max-h-[420px] overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-2xl shadow-slate-900/10">
              {searchQuery.isLoading && <p className="px-3 py-4 text-sm text-slate-500">Searching your workspace…</p>}
              {!searchQuery.isLoading && !searchQuery.data?.projects.length && !searchQuery.data?.tasks.length && !searchQuery.data?.members.length && <p className="px-3 py-4 text-sm text-slate-500">No matching projects, tasks, or members.</p>}
              {!!searchQuery.data?.projects.length && <SearchGroup label="Projects">{searchQuery.data.projects.map((project) => <SearchResult key={`project-${project.id}`} label={project.name} detail={project.description || "Project"} onClick={() => navigate(`/projects/${project.id}`)} />)}</SearchGroup>}
              {!!searchQuery.data?.tasks.length && <SearchGroup label="Tasks">{searchQuery.data.tasks.map((task) => <SearchResult key={`task-${task.id}`} label={task.title} detail={task.projectName} onClick={() => navigate(`/projects/${task.projectId}?task=${task.id}`)} />)}</SearchGroup>}
              {!!searchQuery.data?.members.length && <SearchGroup label="People">{searchQuery.data.members.map((member) => <SearchResult key={`member-${member.id}`} label={member.name || "Team member"} detail={member.email || ""} onClick={() => navigate("/team")} />)}</SearchGroup>}
            </div>}
          </div>
          <div className="relative">
            <button onClick={() => setShowNotifications((value) => !value)} className="relative rounded-xl p-2.5 text-slate-600 hover:bg-slate-100" aria-label="Notifications"><Bell className="h-5 w-5" />{!!notificationQuery.data?.unreadCount && <span className="absolute right-1 top-1 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold text-white">{notificationQuery.data.unreadCount > 9 ? "9+" : notificationQuery.data.unreadCount}</span>}</button>
            {showNotifications && <div className="absolute right-0 top-12 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/10">
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3"><p className="font-semibold">Notifications</p><button onClick={() => markAllRead.mutate()} className="flex items-center gap-1 text-xs font-semibold text-[#2457d6]"><CheckCheck className="h-3.5 w-3.5" />Mark all read</button></div>
              <div className="max-h-80 overflow-y-auto">{notificationQuery.data?.items.length ? notificationQuery.data.items.slice(0, 6).map((item) => <button key={item.id} onClick={() => { if (item.projectId) navigate(`/projects/${item.projectId}`); setShowNotifications(false); }} className={cn("block w-full border-b border-slate-100 px-4 py-3 text-left text-sm hover:bg-slate-50", item.isRead === 0 && "bg-blue-50/60")}><p className="leading-5 text-slate-700">{item.message}</p><p className="mt-1 text-xs text-slate-400">{new Date(item.createdAt).toLocaleDateString()}</p></button>) : <p className="p-6 text-center text-sm text-slate-500">No notifications yet.</p>}</div>
              <button onClick={() => { navigate("/notifications"); setShowNotifications(false); }} className="w-full px-4 py-3 text-sm font-semibold text-[#2457d6] hover:bg-blue-50">View all notifications</button>
            </div>}
          </div>
          <button onClick={() => navigate("/profile")} className="hidden items-center gap-2 rounded-xl p-1.5 hover:bg-slate-100 sm:flex"><Avatar className="h-8 w-8"><AvatarImage src={(user as { avatar?: string | null }).avatar ?? undefined} /><AvatarFallback className="bg-blue-100 text-[11px] font-bold text-[#2457d6]">{initials(user.name)}</AvatarFallback></Avatar><span className="max-w-28 truncate text-sm font-semibold">{user.name?.split(" ")[0] || "Profile"}</span></button>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-7 sm:py-8">{children}</main>
      </div>
    </div>
  );
}

function SearchGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="py-1"><p className="px-3 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>{children}</div>;
}

function SearchResult({ label, detail, onClick }: { label: string; detail: string; onClick: () => void }) {
  return <button onClick={onClick} className="block w-full rounded-xl px-3 py-2 text-left hover:bg-slate-50"><p className="truncate text-sm font-medium text-slate-800">{label}</p><p className="truncate text-xs text-slate-500">{detail}</p></button>;
}

function AuthWelcome() {
  return <div className="min-h-screen overflow-hidden bg-[#f7f8fc] p-5 text-slate-900 sm:p-8"><div className="mx-auto flex min-h-[calc(100vh-2.5rem)] max-w-6xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-indigo-950/10 sm:min-h-[calc(100vh-4rem)]"><section className="relative hidden w-[46%] overflow-hidden bg-[#172554] p-12 text-white lg:flex lg:flex-col"><div className="absolute inset-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, rgba(255,255,255,.35) 1px, transparent 0)", backgroundSize: "26px 26px" }} /><div className="relative flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-white text-lg font-bold text-[#2457d6]">P</div><div><p className="font-display text-lg font-bold">Projectly</p><p className="text-xs text-blue-200">Team workspace</p></div></div><div className="relative my-auto"><p className="text-sm font-bold tracking-[.16em] text-blue-200">CLARITY FOR EVERY DAY</p><h1 className="mt-4 font-display text-5xl font-extrabold leading-[1.08] tracking-tight">Make the work feel lighter.</h1><p className="mt-6 max-w-md text-base leading-7 text-blue-100">A focused shared workspace for projects, tasks, conversations, and the decisions that move work forward.</p><div className="mt-10 space-y-4">{["Plan projects with clear ownership", "See priorities, dates, and progress at a glance", "Keep updates attached to the work"].map((point) => <div className="flex items-center gap-3" key={point}><div className="grid h-6 w-6 place-items-center rounded-full bg-blue-400/20 text-blue-100"><CheckCircle2 className="h-4 w-4" /></div><span className="text-sm font-medium text-blue-50">{point}</span></div>)}</div></div><p className="relative text-xs text-blue-200">Secure team collaboration, built for productive momentum.</p></section><section className="flex flex-1 flex-col justify-center p-7 sm:p-12"><div className="mb-12 flex items-center gap-3 lg:hidden"><div className="grid h-10 w-10 place-items-center rounded-xl bg-[#2457d6] text-lg font-bold text-white">P</div><div><p className="font-display text-lg font-bold">Projectly</p><p className="text-xs text-slate-500">Team workspace</p></div></div><div className="mx-auto w-full max-w-md"><p className="text-sm font-bold tracking-[.14em] text-[#2457d6]">WELCOME</p><h2 className="mt-3 font-display text-3xl font-extrabold tracking-tight">Sign in to your workspace.</h2><p className="mt-3 leading-6 text-slate-500">Use your managed account to access projects, tasks, and shared team updates securely.</p><Button onClick={() => startLogin()} className="mt-8 h-12 w-full rounded-xl bg-[#2457d6] text-sm font-bold shadow-lg shadow-blue-200 hover:bg-[#1f4bc0]">Continue securely</Button><div className="my-7 h-px bg-slate-100" /><p className="text-center text-xs leading-5 text-slate-400">New accounts and account recovery are managed by the secure sign-in service. Your project workspace only receives an authenticated session.</p></div></section></div></div>;
}
