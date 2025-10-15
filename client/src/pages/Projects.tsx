import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ProjectCard } from "@/components/ProjectCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";
import { CreateProjectDialog } from "@/components/CreateProjectDialog";
import { useLocation } from "wouter";
import { getProjects, getProjectStats } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";

export default function Projects() {
  const [, setLocation] = useLocation();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const { toast } = useToast();

  const { data: projects, isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: getProjects,
  });

  const filteredProjects = projects?.filter((project) =>
    project.name.toLowerCase().includes(searchQuery.toLowerCase())
  ) || [];

  const handleProjectSuccess = (project: any) => {
    toast({
      title: "Success",
      description: `Project "${project.name}" created with extracted dimensions`,
    });
    queryClient.invalidateQueries({ queryKey: ["projects"] });
    // Navigate to mesh analysis page with project ID
    setLocation(`/mesh-analysis?project=${project.id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Projects</h1>
          <p className="text-muted-foreground">
            Manage all coal pile assessment projects
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)} data-testid="button-new-project">
          <Plus className="h-4 w-4 mr-2" />
          New Project
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search projects..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
          data-testid="input-search-projects"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} className="h-48 rounded-lg" />
          ))}
        </div>
      ) : filteredProjects.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredProjects.map((project) => {
            const lastUpdated = new Date(project.updatedAt).toLocaleDateString();
            return (
              <ProjectCardWithStats
                key={project.id}
                project={project}
                lastUpdated={lastUpdated}
                onClick={() => setLocation(`/mesh-analysis?project=${project.id}`)}
              />
            );
          })}
        </div>
      ) : (
        <div className="text-center py-12">
          <p className="text-muted-foreground">
            {searchQuery ? "No projects found matching your search." : "No projects yet. Create one to get started!"}
          </p>
        </div>
      )}

      <CreateProjectDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        onSuccess={handleProjectSuccess}
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
    queryKey: ["projects", project.id, "stats"],
    queryFn: () => getProjectStats(project.id),
  });

  // Check if project has 3D models
  const has3DModels = project.meshFileName !== null;

  return (
    <ProjectCard
      id={project.id}
      name={project.name}
      status={project.status}
      measurements={stats?.totalMeasurements || 0}
      lastUpdated={lastUpdated}
      volume={project.volume ?? stats?.totalVolume}
      weight={project.weight ?? stats?.totalWeight}
      has3DModels={has3DModels}
      length={project.length}
      width={project.width}
      height={project.height}
      onClick={onClick}
    />
  );
}
