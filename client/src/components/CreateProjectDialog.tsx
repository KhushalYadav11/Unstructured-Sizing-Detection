import { useState } from "react";
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
import { Upload } from "lucide-react";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit?: (data: { name: string; files: FileList | null }) => void;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  onSubmit,
}: CreateProjectDialogProps) {
  const [name, setName] = useState("");
  const [files, setFiles] = useState<FileList | null>(null);

  const handleSubmit = () => {
    onSubmit?.({ name, files });
    console.log("Project created:", { name, fileCount: files?.length });
    setName("");
    setFiles(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="dialog-create-project">
        <DialogHeader>
          <DialogTitle>Create New Project</DialogTitle>
          <DialogDescription>
            Start a new coal pile assessment project with 3D model upload.
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
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="model-file">3D Model File (.obj/.stl/.gltf/.glb)</Label>
            <div className="border-2 border-dashed rounded-md p-6 text-center hover-elevate">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <Input
                id="model-file"
                type="file"
                accept=".obj,.stl,.gltf,.glb"
                onChange={(e) => setFiles(e.target.files)}
                className="hidden"
                data-testid="input-model-file"
              />
              <Label
                htmlFor="model-file"
                className="cursor-pointer text-sm text-muted-foreground"
              >
                {files ? `${files.length} file(s) selected` : "Click to upload .obj/.stl/.gltf/.glb file"}
              </Label>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            data-testid="button-cancel"
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} data-testid="button-create">
            Create Project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
