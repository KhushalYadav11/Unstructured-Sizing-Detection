import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ThreeDViewer } from "./ThreeDViewer";
import { SplitHorizontal, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function ModelComparison() {
  const [showComparison, setShowComparison] = useState(false);
  
  return (
    <div className="relative w-full h-full">
      {!showComparison ? (
        <>
          <ThreeDViewer measurementMode={true} />
          <div className="absolute top-4 left-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => setShowComparison(true)}
                  className="flex items-center gap-2"
                >
                  <SplitHorizontal className="h-4 w-4" />
                  <span>Compare Models</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Enable side-by-side model comparison</TooltipContent>
            </Tooltip>
          </div>
        </>
      ) : (
        <>
          <div className="flex h-full">
            <div className="w-1/2 h-full border-r border-gray-700">
              <ThreeDViewer measurementMode={true} />
            </div>
            <div className="w-1/2 h-full">
              <ThreeDViewer measurementMode={true} />
            </div>
          </div>
          <div className="absolute top-4 left-4">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="secondary" 
                  size="sm" 
                  onClick={() => setShowComparison(false)}
                  className="flex items-center gap-2"
                >
                  <X className="h-4 w-4" />
                  <span>Exit Comparison</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Return to single model view</TooltipContent>
            </Tooltip>
          </div>
        </>
      )}
    </div>
  );
}