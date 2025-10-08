import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MetricCard } from "@/components/MetricCard";
import { ProjectCard } from "@/components/ProjectCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendingUp, Scale, FileCheck, Target, Plus, Box } from "lucide-react";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { useLocation } from "wouter";
import { getProjects, getProjectStats, getTodayCount, getAnalyticsOverview, createProject } from "@/lib/api";
import { Skeleton } from "@/components/ui/skeleton";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function Dashboard() {
  const [, setLocation] = useLocation();
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

  const { data: projects, isLoading: projectsLoading } = useQuery({
    queryKey: ["/api/projects"],
    queryFn: getProjects,
  });

  const { data: todayData } = useQuery({
    queryKey: ["/api/analytics/today"],
    queryFn: getTodayCount,
  });

  const { data: analytics } = useQuery({
    queryKey: ["/api/analytics/overview"],
    queryFn: getAnalyticsOverview,
  });

  const recentProjects = projects?.slice(0, 3) || [];
  const todayCount = todayData?.count || 0;
  const qualityRate = analytics
    ? ((analytics.qualityCount.excellent || 0) + (analytics.qualityCount.good || 0)) /
      Math.max(analytics.totalMeasurements, 1) * 100
    : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Coal volume and weight estimation overview
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="button-new-project">
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <MetricCard
          title="Today's Measurements"
          value={todayCount}
          subtitle="of 60 daily target"
          icon={TrendingUp}
        />
        <MetricCard
          title="Total Volume"
          value={analytics ? `${analytics.totalVolume.toFixed(1)} m³` : "0 m³"}
          subtitle="Active projects"
          icon={Scale}
        />
        <MetricCard
          title="Estimated Weight"
          value={analytics ? `${analytics.totalWeight.toFixed(1)} MT` : "0 MT"}
          subtitle="Total inventory"
          icon={Scale}
        />
        <MetricCard
          title="Quality Rate"
          value={`${Math.round(qualityRate)}%`}
          subtitle="Excellent/Good"
          icon={FileCheck}
        />
      </div>

      {/* Quick Access to 3D Analysis */}
      <Card className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/20 dark:to-indigo-950/20 border-blue-200 dark:border-blue-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Box className="h-5 w-5 text-blue-600" />
            3D Mesh Analysis
          </CardTitle>
          <CardDescription>
            Upload your .obj files from Meshroom for automated volume and weight calculation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            onClick={() => setLocation("/mesh-analysis")}
            className="bg-blue-600 hover:bg-blue-700"
          >
            <Box className="h-4 w-4 mr-2" />
            Start 3D Analysis
          </Button>
        </CardContent>
      </Card>

      <div>
        <h2 className="text-xl font-semibold mb-4">Recent Projects</h2>
        {projectsLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-48 rounded-lg" />
            ))}
          </div>
        ) : recentProjects.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {recentProjects.map((project) => {
              const lastUpdated = new Date(project.updatedAt).toLocaleDateString();
              return (
                <ProjectCardWithStats
                  key={project.id}
                  project={project}
                  lastUpdated={lastUpdated}
                  onClick={() => setLocation(`/measurement/${project.id}`)}
                />
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 border rounded-lg">
            <p className="text-muted-foreground mb-4">No projects yet</p>
            <Button onClick={() => setShowCreateDialog(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create Your First Project
            </Button>
          </div>
        )}
      </div>

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
    </div>
  );
}

function ProjectCardWithStats({
  project,
  lastUpdated,
  onClick,
}: {
  project: any;
  lastUpdated: string;
  onClick: () => void;
}) {
  const { data: stats } = useQuery({
    queryKey: ["/api/projects", project.id, "stats"],
    queryFn: () => getProjectStats(project.id),
  });

  return (
    <ProjectCard
      id={project.id}
      name={project.name}
      status={project.status}
      measurements={stats?.totalMeasurements || 0}
      lastUpdated={lastUpdated}
      volume={stats?.totalVolume}
      weight={stats?.totalWeight}
      onClick={onClick}
    />
  );
}
