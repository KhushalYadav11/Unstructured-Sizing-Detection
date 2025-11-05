import { useEffect, useRef } from "react";
import * as THREE from "three";
import { Button } from "@/components/ui/button";
import { Grid } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

interface MeasurementGridProps {
  scene: THREE.Scene | null;
  gridSize: number;
  gridDivisions: number;
  showGrid: boolean;
  setShowGrid: (show: boolean) => void;
  setGridSize: (size: number) => void;
  setGridDivisions: (divisions: number) => void;
}

export function MeasurementGrid({
  scene,
  gridSize,
  gridDivisions,
  showGrid,
  setShowGrid,
  setGridSize,
  setGridDivisions,
}: MeasurementGridProps) {
  const gridRef = useRef<THREE.GridHelper | null>(null);

  // Update grid helper
  useEffect(() => {
    if (!scene) return;
    
    // Remove existing grid if any
    if (gridRef.current) {
      scene.remove(gridRef.current);
      if (gridRef.current.material instanceof THREE.Material) {
        gridRef.current.material.dispose();
      }
      if (Array.isArray(gridRef.current.material)) {
        gridRef.current.material.forEach(m => m.dispose());
      }
      gridRef.current = null;
    }
    
    // Add new grid if enabled
    if (showGrid) {
      const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x444444, 0x222222);
      scene.add(gridHelper);
      gridRef.current = gridHelper;
    }
  }, [scene, showGrid, gridSize, gridDivisions]);

  return (
    <>
      {/* Grid Toggle Button */}
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setShowGrid(!showGrid)}
              data-testid="button-toggle-grid"
            >
              <Grid className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{showGrid ? "Hide grid" : "Show grid"}</TooltipContent>
        </Tooltip>
      </div>
      
      {/* Grid Controls Panel */}
      {showGrid && (
        <div className="absolute bottom-4 left-4 bg-secondary/80 rounded-md p-3 flex flex-col gap-2">
          <div className="text-xs font-medium">Grid Settings</div>
          <div>
            <div className="text-xs text-muted-foreground">Grid Size</div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="5"
                max="50"
                step="5"
                value={gridSize}
                onChange={(e) => setGridSize(Number(e.target.value))}
                className="w-24"
              />
              <span className="text-xs">{gridSize}</span>
            </div>
          </div>
          
          <div>
            <div className="text-xs text-muted-foreground">Divisions</div>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="5"
                max="50"
                step="5"
                value={gridDivisions}
                onChange={(e) => setGridDivisions(Number(e.target.value))}
                className="w-24"
              />
              <span className="text-xs">{gridDivisions}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}