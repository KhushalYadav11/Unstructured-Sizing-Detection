import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Folder, Calendar, TrendingUp, MoreVertical, Box, Ruler, ScanLine } from "lucide-react";

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
  thumbnailUrl?: string | null;
  reconstructionStatus?: string;
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
  thumbnailUrl,
  reconstructionStatus,
}: ProjectCardProps) {
  const hasDimensions = length !== undefined && width !== undefined && height !== undefined;
  const hasReconstruction = reconstructionStatus === "ready";

  return (
    <Card
      className="transition-shadow hover:shadow-md cursor-pointer overflow-hidden"
      onClick={onClick}
      data-testid={`card-project-${name.toLowerCase().replace(/\s+/g, "-")}`}
    >
      {/* Thumbnail strip */}
      {thumbnailUrl ? (
        <div className="h-36 w-full overflow-hidden bg-muted">
          <img
            src={thumbnailUrl}
            alt={`${name} preview`}
            className="w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          />
        </div>
      ) : hasReconstruction ? (
        <div className="h-36 w-full bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center">
          <ScanLine className="h-10 w-10 text-primary/40" />
        </div>
      ) : null}

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
          }}
          data-testid="button-project-menu"
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent className="p-5 space-y-3">
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

        {(volume || weight) && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t">
            {volume !== undefined && (
              <div>
                <div className="text-xs text-muted-foreground">Volume</div>
                <div className="font-mono font-semibold" data-testid="text-project-volume">
                  {volume.toFixed(2)} m³
                </div>
              </div>
            )}
            {weight !== undefined && (
              <div>
                <div className="text-xs text-muted-foreground">Weight</div>
                <div className="font-mono font-semibold" data-testid="text-project-weight">
                  {weight.toLocaleString(undefined, { maximumFractionDigits: 0 })} g
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-0 pb-4 px-5 flex justify-between items-center">
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
              window.location.href = `/project-view/${id}`;
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
