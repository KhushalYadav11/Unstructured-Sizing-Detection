import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Folder, Calendar, TrendingUp, MoreVertical, Box, Ruler } from "lucide-react";

interface ProjectCardProps {
  id: string;
  name: string;
  status: "draft" | "processing" | "completed";
  measurements: number;
  lastUpdated: string;
  volume?: number;
  weight?: number;
  onClick?: () => void;
  has3DModels?: boolean;
  length?: number;
  width?: number;
  height?: number;
}

const statusConfig = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground" },
  processing: { label: "Processing", className: "bg-chart-3/20 text-chart-3" },
  completed: { label: "Completed", className: "bg-chart-2/20 text-chart-2" },
};

export function ProjectCard({
  id,
  name,
  status,
  measurements,
  lastUpdated,
  volume,
  weight,
  onClick,
  has3DModels,
  length,
  width,
  height,
}: ProjectCardProps) {
  const hasDimensions = length !== undefined && width !== undefined && height !== undefined;
  
  return (
    <Card
      className="hover-elevate active-elevate-2 cursor-pointer"
      onClick={onClick}
      data-testid={`card-project-${name.toLowerCase().replace(/\s+/g, "-")}`}
    >
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-10 w-10 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Folder className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold truncate" data-testid="text-project-name">
              {name}
            </h3>
            {hasDimensions && (
              <div className="flex items-center gap-1 text-xs text-primary">
                <Ruler className="h-3 w-3" />
                <span>3D Model Analyzed</span>
              </div>
            )}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="flex-shrink-0"
          onClick={(e) => {
            e.stopPropagation();
            console.log("Project menu clicked");
          }}
          data-testid="button-project-menu"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <Badge
            className={statusConfig[status].className}
            data-testid="badge-project-status"
          >
            {statusConfig[status].label}
          </Badge>
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <TrendingUp className="h-3 w-3" />
            <span data-testid="text-measurement-count">{measurements} measurements</span>
          </div>
        </div>
        
        {hasDimensions && (
          <div className="space-y-2 pt-2 border-t">
            <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <Ruler className="h-3 w-3" />
              Extracted Dimensions
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-xs text-muted-foreground">Length</div>
                <div className="font-mono text-sm font-semibold" data-testid="text-project-length">
                  {length?.toFixed(2)} m
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Width</div>
                <div className="font-mono text-sm font-semibold" data-testid="text-project-width">
                  {width?.toFixed(2)} m
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground">Height</div>
                <div className="font-mono text-sm font-semibold" data-testid="text-project-height">
                  {height?.toFixed(2)} m
                </div>
              </div>
            </div>
          </div>
        )}
        
        {volume && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            <div>
              <div className="text-xs text-muted-foreground">Volume</div>
              <div className="font-mono font-semibold" data-testid="text-project-volume">
                {volume.toFixed(2)} m³
              </div>
            </div>
            {weight && (
              <div>
                <div className="text-xs text-muted-foreground">Weight</div>
                <div className="font-mono font-semibold" data-testid="text-project-weight">
                  {weight.toFixed(2)} MT
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-0 pb-3 px-6 flex justify-between items-center">
        <div className="flex items-center text-xs text-muted-foreground gap-1">
          <Calendar className="h-3 w-3" />
          <span data-testid="text-last-updated">Updated {lastUpdated}</span>
        </div>
        {has3DModels && (
          <Button 
            size="sm" 
            variant="outline"
            className="text-xs"
            onClick={(e) => {
              e.stopPropagation();
              window.location.href = `/mesh-analysis?project=${id}`;
            }}
          >
            <Box className="h-3 w-3 mr-1" />
            3D View
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
