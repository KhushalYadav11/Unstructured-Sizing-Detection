import { useState } from "react";
import { ThreeDViewer } from "@/components/ThreeDViewer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Box, Info } from "lucide-react";
import { useLocation } from "wouter";
import type { ModelMetrics } from "@/lib/three-utils";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";

export default function ThreeDView() {
  const [, setLocation] = useLocation();
  const [measurementMode, setMeasurementMode] = useState(false);
  const [modelMetrics, setModelMetrics] = useState<ModelMetrics | null>(null);

  return (
    <div className="space-y-6 h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setLocation("/")}
            className="shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Box className="h-8 w-8 text-primary" />
              3D Model Viewer
            </h1>
            <p className="text-muted-foreground">
              Interactive viewer for .obj, .stl, .gltf, and .glb files
            </p>
          </div>
        </div>
      </div>

      {/* Info Alert */}
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>How to Use</AlertTitle>
        <AlertDescription>
          Upload a 3D model file using the "Upload Model" button. Use orbit controls to rotate (left-click drag), pan (right-click drag), and zoom (scroll wheel). Select the appropriate unit for your model before uploading.
        </AlertDescription>
      </Alert>

      {/* Main Viewer */}
      <Card className="flex-1 flex flex-col min-h-0">
        <CardHeader>
          <CardTitle>Interactive 3D Viewer</CardTitle>
          <CardDescription>
            Full-featured viewer with orbit controls, zoom, rotation, and measurement capabilities
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 p-0">
          <div className="h-full min-h-[600px]">
            <ThreeDViewer
              measurementMode={measurementMode}
              onMeasurementToggle={() => setMeasurementMode(!measurementMode)}
              onModelMetrics={setModelMetrics}
            />
          </div>
        </CardContent>
      </Card>

      {/* Model Information Panel */}
      {modelMetrics && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Model Information</CardTitle>
            <CardDescription>
              Extracted dimensions and statistics from the loaded 3D model
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Length (X)</p>
                <p className="text-2xl font-bold">
                  {modelMetrics.dimensions.length.toFixed(2)} m
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Width (Z)</p>
                <p className="text-2xl font-bold">
                  {modelMetrics.dimensions.width.toFixed(2)} m
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Height (Y)</p>
                <p className="text-2xl font-bold">
                  {modelMetrics.dimensions.height.toFixed(2)} m
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Volume</p>
                <p className="text-2xl font-bold">
                  {modelMetrics.volume.toFixed(2)} m³
                </p>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Triangle Count:</span>
                <span className="font-mono font-medium">
                  {modelMetrics.triangles.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm mt-2">
                <span className="text-muted-foreground">Bounding Box:</span>
                <span className="font-mono text-xs">
                  [{modelMetrics.boundingBox.min.x.toFixed(2)}, {modelMetrics.boundingBox.min.y.toFixed(2)}, {modelMetrics.boundingBox.min.z.toFixed(2)}] to [{modelMetrics.boundingBox.max.x.toFixed(2)}, {modelMetrics.boundingBox.max.y.toFixed(2)}, {modelMetrics.boundingBox.max.z.toFixed(2)}]
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Features Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Viewer Features</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <h4 className="font-semibold">Controls</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• <strong>Rotate:</strong> Left-click + drag</li>
                <li>• <strong>Pan:</strong> Right-click + drag</li>
                <li>• <strong>Zoom:</strong> Mouse wheel or zoom buttons</li>
                <li>• <strong>Auto-rotate:</strong> Toggle with rotation button</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold">Supported Formats</h4>
              <ul className="space-y-1 text-muted-foreground">
                <li>• <strong>.obj</strong> - Wavefront OBJ files</li>
                <li>• <strong>.stl</strong> - Stereolithography files</li>
                <li>• <strong>.gltf/.glb</strong> - GL Transmission Format</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
