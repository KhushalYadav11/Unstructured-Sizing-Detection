import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Unit } from "@/lib/three-utils";

interface MeasurementReportProps {
  measurementPoints: THREE.Vector3[];
  annotations: string[];
  unit: Unit;
  cumulativeDistance: number | null;
}

export function MeasurementReport({
  measurementPoints,
  annotations,
  unit,
  cumulativeDistance
}: MeasurementReportProps) {
  const [open, setOpen] = useState(false);
  
  const generateReport = () => {
    const reportData = {
      date: new Date().toLocaleString(),
      totalPoints: measurementPoints.length,
      totalDistance: cumulativeDistance,
      unit,
      points: measurementPoints.map((point, index) => ({
        id: index + 1,
        x: point.x.toFixed(3),
        y: point.y.toFixed(3),
        z: point.z.toFixed(3),
        label: annotations[index] || `Point ${index + 1}`
      }))
    };
    
    return reportData;
  };
  
  const downloadReport = () => {
    const report = generateReport();
    const reportJson = JSON.stringify(report, null, 2);
    const blob = new Blob([reportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `measurement-report-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  const formatDistance = (distance: number | null) => {
    if (distance === null) return "N/A";
    return `${distance.toFixed(3)} ${unit}`;
  };
  
  return (
    <>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setOpen(true)}
            disabled={measurementPoints.length === 0}
            className="flex items-center gap-2"
          >
            <FileText className="h-4 w-4" />
            <span>Report</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Generate measurement report</TooltipContent>
      </Tooltip>
      
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Measurement Report</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex justify-between items-center">
              <div className="text-sm text-muted-foreground">
                Generated on {new Date().toLocaleString()}
              </div>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={downloadReport}
                className="flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                <span>Download Report</span>
              </Button>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="border rounded-md p-4">
                <h3 className="text-lg font-medium mb-2">Summary</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Total Points:</span>
                    <span className="font-medium">{measurementPoints.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Total Distance:</span>
                    <span className="font-medium">{formatDistance(cumulativeDistance)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Unit:</span>
                    <span className="font-medium">{unit}</span>
                  </div>
                </div>
              </div>
              
              <div className="border rounded-md p-4">
                <h3 className="text-lg font-medium mb-2">Visualization</h3>
                <div className="h-40 flex items-center justify-center bg-muted rounded">
                  <span className="text-sm text-muted-foreground">Measurement visualization chart</span>
                </div>
              </div>
            </div>
            
            <div className="border rounded-md p-4">
              <h3 className="text-lg font-medium mb-2">Measurement Points</h3>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 px-4">Point</th>
                      <th className="text-left py-2 px-4">Label</th>
                      <th className="text-left py-2 px-4">X</th>
                      <th className="text-left py-2 px-4">Y</th>
                      <th className="text-left py-2 px-4">Z</th>
                    </tr>
                  </thead>
                  <tbody>
                    {measurementPoints.map((point, index) => (
                      <tr key={index} className="border-b">
                        <td className="py-2 px-4">{index + 1}</td>
                        <td className="py-2 px-4">{annotations[index] || `Point ${index + 1}`}</td>
                        <td className="py-2 px-4">{point.x.toFixed(3)}</td>
                        <td className="py-2 px-4">{point.y.toFixed(3)}</td>
                        <td className="py-2 px-4">{point.z.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}