import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider, useMutation } from "@tanstack/react-query";
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
import { createProject } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";

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

  const { toast } = useToast();
  const createMutation = useMutation({
    mutationFn: createProject,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      toast({
        title: "Project created",
        description: "Your new project has been created successfully.",
      });
      setShowCreateDialog(false);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create project. Please try again.",
        variant: "destructive",
      });
    },
  });

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
                if (!data.name.trim()) {
                  toast({
                    title: "Error",
                    description: "Please enter a project name.",
                    variant: "destructive",
                  });
                  return;
                }
                if (!data.files || data.files.length === 0) {
                  toast({
                    title: "Error",
                    description: "Please upload a 3D model file.",
                    variant: "destructive",
                  });
                  return;
                }
                createMutation.mutate({ name: data.name.trim(), status: "draft" });
              }}
            />
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
