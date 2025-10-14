import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Upload, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";

export interface CreateProjectFormData {
  name: string;
  files?: File[];
}

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: (project: any) => void;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Reset form when dialog closes
  useEffect(() => {
    if (!open) {
      setName("");
      setFile(null);
    }
  }, [open]);

  const createProjectMutation = useMutation({
    mutationFn: async (data: { name: string; file: File }) => {
      const formData = new FormData();
      formData.append("name", data.name);
      formData.append("file", data.file);

      const response = await fetch("/api/projects/with-mesh", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to create project");
      }

      const payload = await response.json();

      return {
        project: {
          ...payload.project,
          weight: payload.meshAnalysis?.weight ?? payload.project?.weight ?? null,
        },
      };
    },
    onSuccess: (data) => {
      toast({
        title: "Project Created",
        description: `${data.project.name} has been created successfully with extracted dimensions and weight.`,
      });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      onOpenChange(false);
      onSuccess?.(data.project);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = () => {
    if (!name.trim()) {
      toast({
        title: "Validation Error",
        description: "Please enter a project name",
        variant: "destructive",
      });
      return;
    }
    
    if (!file) {
      toast({
        title: "Validation Error",
        description: "Please upload a .obj file",
        variant: "destructive",
      });
      return;
    }

    // Validate file extension
    if (!file.name.toLowerCase().endsWith('.obj')) {
      toast({
        title: "Invalid File",
        description: "Only .obj files are supported",
        variant: "destructive",
      });
      return;
    }

    createProjectMutation.mutate({ name, file });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file size (max 50MB)
      if (selectedFile.size > 50 * 1024 * 1024) {
        toast({
          title: "File Too Large",
          description: "File size must be less than 50MB",
          variant: "destructive",
        });
        return;
      }
      setFile(selectedFile);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-create-project">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Upload a 3D model (.obj) to automatically extract dimensions and calculate volume.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="project-name">Project Name</Label>
            <Input
              id="project-name"
              placeholder="e.g., South Stockpile Assessment"
              value={name}
              onChange={(e) => setName(e.target.value)}
              data-testid="input-project-name"
              disabled={createProjectMutation.isPending}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="model-file">3D Model File (.obj only)</Label>
            <div className="border-2 border-dashed rounded-md p-6 text-center hover:border-primary/50 transition-colors">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <Input
                id="model-file"
                type="file"
                accept=".obj"
                onChange={handleFileChange}
                className="hidden"
                data-testid="input-model-file"
                disabled={createProjectMutation.isPending}
              />
              <Label
                htmlFor="model-file"
                className="cursor-pointer text-sm text-muted-foreground hover:text-primary transition-colors"
              >
                {file ? (
                  <div className="space-y-1">
                    <p className="font-medium text-foreground">{file.name}</p>
                    <p className="text-xs">
                      {(file.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                ) : (
                  "Click to upload .obj file (max 50MB)"
                )}
              </Label>
            </div>
            <p className="text-xs text-muted-foreground">
              The system will automatically extract length, width, height, and volume from your 3D model.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel"
            disabled={createProjectMutation.isPending}
          >
            Cancel
          </Button>
          <Button 
            onClick={handleSubmit} 
            data-testid="button-create"
            disabled={createProjectMutation.isPending}
          >
            {createProjectMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              "Create Project"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
