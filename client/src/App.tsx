import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "@/components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import MyTasks from "./pages/MyTasks";
import NotificationsPage from "./pages/Notifications";
import NotFound from "./pages/NotFound";
import Profile from "./pages/Profile";
import Projects from "./pages/Projects";
import ProjectWorkspace from "./pages/ProjectWorkspace";
import SettingsPage from "./pages/Settings";
import Team from "./pages/Team";
import { Route, Switch } from "wouter";

function ProtectedPage({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function Router() {
  return <Switch>
    <Route path="/">{() => <ProtectedPage><Home /></ProtectedPage>}</Route>
    <Route path="/projects">{() => <ProtectedPage><Projects /></ProtectedPage>}</Route>
    <Route path="/projects/:id">{() => <ProtectedPage><ProjectWorkspace /></ProtectedPage>}</Route>
    <Route path="/my-tasks">{() => <ProtectedPage><MyTasks /></ProtectedPage>}</Route>
    <Route path="/team">{() => <ProtectedPage><Team /></ProtectedPage>}</Route>
    <Route path="/notifications">{() => <ProtectedPage><NotificationsPage /></ProtectedPage>}</Route>
    <Route path="/profile">{() => <ProtectedPage><Profile /></ProtectedPage>}</Route>
    <Route path="/settings">{() => <ProtectedPage><SettingsPage /></ProtectedPage>}</Route>
    <Route path="/404">{() => <ProtectedPage><NotFound /></ProtectedPage>}</Route>
    <Route>{() => <ProtectedPage><NotFound /></ProtectedPage>}</Route>
  </Switch>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster richColors position="top-right" /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
