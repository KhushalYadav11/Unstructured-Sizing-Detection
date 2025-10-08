import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useState } from "react";
import Dashboard from "@/pages/Dashboard";
import Projects from "@/pages/Projects";
import Measurement from "@/pages/Measurement";
import MeshAnalysis from "@/pages/MeshAnalysis";
import Analytics from "@/pages/Analytics";
import Reports from "@/pages/Reports";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/projects" component={Projects} />
      <Route path="/measurement/:id" component={Measurement} />
      <Route path="/mesh-analysis" component={MeshAnalysis} />
      <Route path="/analytics" component={Analytics} />
      <Route path="/reports" component={Reports} />
      <Route component={NotFound} />
    </Switch>
  );
}

export default function App() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider defaultTheme="dark">
          <TooltipProvider>
            <SidebarProvider style={style as React.CSSProperties}>
              <div className="flex h-screen w-full">
                <AppSidebar onNewProject={() => setShowCreateDialog(true)} />
                <div className="flex flex-col flex-1 min-w-0">
                  <header className="flex items-center justify-between p-4 border-b gap-4">
                    <SidebarTrigger data-testid="button-sidebar-toggle" />
                    <div className="flex items-center gap-2">
                      <ThemeToggle />
                    </div>
                  </header>
                  <main className="flex-1 overflow-auto p-6">
                    <ErrorBoundary>
                      <Router />
                    </ErrorBoundary>
                  </main>
                </div>
              </div>
            </SidebarProvider>
            <CreateProjectDialog
              open={showCreateDialog}
              onOpenChange={setShowCreateDialog}
              onSubmit={(data) => {
                console.log("New project created:", data);
              }}
            />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
