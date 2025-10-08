import { MeshProcessor } from "@/components/MeshProcessor";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Box, Upload, Calculator, Download } from "lucide-react";

export default function MeshAnalysis() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">3D Mesh Analysis</h1>
        <p className="text-muted-foreground">
          Upload your 3D coal pile models for automated volume and weight calculation
        </p>
      </div>

      {/* Feature Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Upload className="h-4 w-4 text-blue-500" />
              Upload Models
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Support for .obj, .ply, and .stl file formats up to 50MB
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calculator className="h-4 w-4 text-green-500" />
              Auto Calculate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Automatic volume calculation using geometric analysis
            </CardDescription>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Download className="h-4 w-4 text-purple-500" />
              Export Results
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>
              Download detailed analysis results in JSON format
            </CardDescription>
          </CardContent>
        </Card>
      </div>

      {/* Supported Coal Types */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Supported Coal Types</CardTitle>
          <CardDescription>
            Select the appropriate coal type for accurate weight estimation
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary">Anthracite (1500 kg/m³)</Badge>
            <Badge variant="secondary">Bituminous Coal (1300 kg/m³)</Badge>
            <Badge variant="secondary">Sub-bituminous Coal (1200 kg/m³)</Badge>
            <Badge variant="secondary">Lignite (1100 kg/m³)</Badge>
            <Badge variant="secondary">Coking Coal (1350 kg/m³)</Badge>
            <Badge variant="secondary">Thermal Coal (1250 kg/m³)</Badge>
          </div>
        </CardContent>
      </Card>

      {/* Main Processing Interface */}
      <MeshProcessor />

      {/* Instructions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How to Use</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-semibold">Step 1: Prepare Your Model</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Use Meshroom or similar software to generate 3D models from photos</li>
                <li>• Ensure the model is a closed mesh for accurate volume calculation</li>
                <li>• Supported formats: .obj, .ply, .stl</li>
                <li>• Maximum file size: 50MB</li>
              </ul>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-semibold">Step 2: Process & Analyze</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Upload your 3D model file</li>
                <li>• Select the appropriate coal type</li>
                <li>• Click "Process Mesh" to start analysis</li>
                <li>• Download results for your records</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}