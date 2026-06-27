import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import {
  BoxIcon,
  Ruler,
  Loader2,
  ArrowLeft,
  Box,
  FileText,
  CheckCircle2,
  Download,
  MapPin,
  ScanLine,
  Weight,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { CoalTypeSelector, COAL_TYPES } from "@/components/CoalTypeSelector";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export default function Analysis3D() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  
  // Extract project ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('project');

  // Local coal type state for weight analysis
  const [coalType, setCoalType] = useState<string>("bituminous");
  const [weightUnit, setWeightUnit] = useState<'grams'|'tons'>("grams");

  // Fetch project details
  const { data: project, isLoading: isLoadingProject, error } = useQuery({
    queryKey: ['project', projectId],
    queryFn: async () => {
      if (!projectId) return null;
      const response = await fetch(`/api/projects/${projectId}`);
      if (!response.ok) throw new Error('Failed to fetch project');
      return response.json();
    },
    enabled: !!projectId,
  });

  useEffect(() => {
    if (error) {
      toast({
        title: "Error loading project",
        description: "Failed to load project details",
        variant: "destructive",
      });
    }
  }, [error, toast]);

  if (isLoadingProject) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto py-6">
        <Card className="h-[600px]">
          <CardContent className="flex flex-col items-center justify-center h-full">
            <BoxIcon className="h-16 w-16 mb-4 text-muted-foreground" />
            <h3 className="text-xl font-medium mb-2">No Project Selected</h3>
            <p className="text-muted-foreground text-center max-w-md mb-6">
              Please select a project from the projects page to view its 3D analysis.
            </p>
            <Button onClick={() => setLocation('/projects')}>
              Go to Projects
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Get mesh file URL
  const meshUrl = project.meshFilePath 
    ? `/api/mesh/files/${project.meshFilePath.split(/[/\\]/).pop()}`
    : null;

  // Pull GPS from photo EXIF if available
  const gpsCoords: { lat: number; lng: number } | null = (() => {
    const photos: any[] = project.photos || [];
    for (const p of photos) {
      if (p.exif?.gps?.lat && p.exif?.gps?.lng) {
        return { lat: p.exif.gps.lat, lng: p.exif.gps.lng };
      }
    }
    return null;
  })();

  // Reconstruction artifacts
  const reconArtifacts = project.reconstructionArtifacts as any;
  const meshArtifactUrl = reconArtifacts?.mesh?.url ?? null;
  const orthophotoUrl = reconArtifacts?.orthophoto?.url ?? null;

  const handleDownloadModel = () => {
    if (meshUrl) {
      window.open(meshUrl, '_blank');
    }
  };

  // Compute volume in m³: prefer stored volume, else L×W×H
  const computedVolumeM3: number | null = (typeof project.volume === 'number' && !isNaN(project.volume))
    ? project.volume
    : (project.length && project.width && project.height
        ? project.length * project.width * project.height
        : null);

  // Selected coal density (kg/m³)
  const selectedCoal = COAL_TYPES.find(c => c.id === coalType);

  // Weight in grams using kg/m³ density (m³ × kg/m³ × 1000 → g)
  const estimatedWeightGrams = (computedVolumeM3 && selectedCoal)
    ? computedVolumeM3 * selectedCoal.density * 1000
    : null;
  const estimatedWeightTons = (computedVolumeM3 && selectedCoal)
    ? (computedVolumeM3 * selectedCoal.density) / 1000
    : null;

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-2">
        <Button 
          variant="outline" 
          className="self-start" 
          onClick={() => setLocation(`/projects`)}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Projects
        </Button>
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">3D Mesh Analysis</h1>
            <p className="text-muted-foreground mt-1">
              Project: <span className="font-medium">{project.name}</span>
            </p>
          </div>
          {meshUrl && (
            <Button variant="outline" onClick={handleDownloadModel}>
              <Download className="mr-2 h-4 w-4" />
              Download Model
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Project Information Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Project Information
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label className="text-muted-foreground">Project Name</Label>
              <p className="text-lg font-medium">{project.name}</p>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label className="text-muted-foreground">Status</Label>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-green-500" />
                <p className="text-lg font-medium capitalize">{project.status}</p>
              </div>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label className="text-muted-foreground">3D Model File</Label>
              <p className="text-sm break-all">{project.meshFileName || 'No file uploaded'}</p>
            </div>
            <Separator />
            <div className="space-y-2">
              <Label className="text-muted-foreground">Created</Label>
              <p className="text-sm">{new Date(project.createdAt).toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>

        {/* Extracted Dimensions Card */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Box className="h-5 w-5" />
              Extracted Dimensions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label className="text-muted-foreground flex items-center gap-1">
                  <Ruler className="h-4 w-4" />
                  Length
                </Label>
                <p className="text-3xl font-bold">{project.length !== null && project.length !== undefined ? project.length.toLocaleString(undefined, { maximumFractionDigits: 4 }) : 'N/A'}</p>
                <p className="text-xs text-muted-foreground">meters</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground flex items-center gap-1">
                  <Ruler className="h-4 w-4" />
                  Width
                </Label>
                <p className="text-3xl font-bold">{project.width !== null && project.width !== undefined ? project.width.toLocaleString(undefined, { maximumFractionDigits: 4 }) : 'N/A'}</p>
                <p className="text-xs text-muted-foreground">meters</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground flex items-center gap-1">
                  <Ruler className="h-4 w-4" />
                  Height
                </Label>
                <p className="text-3xl font-bold">{project.height !== null && project.height !== undefined ? project.height.toLocaleString(undefined, { maximumFractionDigits: 4 }) : 'N/A'}</p>
                <p className="text-xs text-muted-foreground">meters</p>
              </div>
              <div className="space-y-1">
                <Label className="text-muted-foreground flex items-center gap-1">
                  <BoxIcon className="h-4 w-4" />
                  Volume
                </Label>
                <p className="text-3xl font-bold">{typeof project.volume === 'number' ? (project.volume < 1 ? project.volume.toLocaleString(undefined, { maximumFractionDigits: 6 }) : project.volume.toLocaleString(undefined, { maximumFractionDigits: 3 })) : 'N/A'}</p>
                <p className="text-xs text-muted-foreground">cubic meters</p>
              </div>
            </div>
            
            <Separator />
            
            <div className="bg-primary/10 p-4 rounded-lg border border-primary/20">
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Analysis Complete
              </h4>
              <p className="text-sm text-muted-foreground">
                Dimensions extracted from 3D mesh bounding box. Volume calculated using divergence theorem on mesh geometry.
              </p>
            </div>
            
            <div className="bg-muted p-4 rounded-lg">
              <h4 className="font-medium mb-2">Calculation Method</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Bounding box analysis for L×W×H</li>
                <li>• Divergence theorem for volume</li>
                <li>• {project.meshFileName ? `Mesh geometry analyzed` : 'Mesh analysis'}</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Weight Analysis Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <CoalTypeSelector value={coalType} onChange={setCoalType} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Weight className="h-5 w-5" />
              Estimated Weight
            </CardTitle>
          </CardHeader>
          <CardContent>
            {estimatedWeightGrams !== null ? (
              <>
                <div
                  className="text-3xl font-mono font-bold text-primary"
                  data-testid="text-overview-estimated-weight"
                >
                  {weightUnit === "grams"
                    ? estimatedWeightGrams!.toLocaleString(undefined, { maximumFractionDigits: 0 }) + " g"
                    : (estimatedWeightTons ?? 0).toLocaleString(undefined, { maximumFractionDigits: 3 }) + " t"}
                </div>
                <div className="flex items-center justify-end mt-2">
                  <Select value={weightUnit} onValueChange={(v) => setWeightUnit(v as 'grams'|'tons')}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grams">Grams</SelectItem>
                      <SelectItem value="tons">Metric Tons</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {weightUnit === 'grams' ? 'Grams' : 'Metric tons'} (Volume × Density: {selectedCoal?.density} kg/m³)
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Insufficient volume or dimensions to calculate weight.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Reconstruction preview row */}
      {(orthophotoUrl || meshArtifactUrl || gpsCoords) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Orthophoto thumbnail */}
          {orthophotoUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <ScanLine className="h-4 w-4" />
                  Orthophoto Preview
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <img
                  src={orthophotoUrl}
                  alt="Orthophoto"
                  className="w-full rounded-b-lg object-cover max-h-64"
                  onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = "none"; }}
                />
              </CardContent>
            </Card>
          )}

          {/* GPS location map */}
          {gpsCoords && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <MapPin className="h-4 w-4" />
                  Capture Location
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-md overflow-hidden border">
                  <iframe
                    title="GPS Location"
                    width="100%"
                    height="200"
                    style={{ border: 0 }}
                    src={`https://www.openstreetmap.org/export/embed.html?bbox=${gpsCoords.lng - 0.005},${gpsCoords.lat - 0.005},${gpsCoords.lng + 0.005},${gpsCoords.lat + 0.005}&layer=mapnik&marker=${gpsCoords.lat},${gpsCoords.lng}`}
                    allowFullScreen
                  />
                </div>
                <div className="text-xs text-muted-foreground font-mono flex gap-4">
                  <span>Lat: {gpsCoords.lat.toFixed(6)}°</span>
                  <span>Lng: {gpsCoords.lng.toFixed(6)}°</span>
                </div>
                <a
                  href={`https://www.google.com/maps?q=${gpsCoords.lat},${gpsCoords.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1"
                >
                  <MapPin className="h-3 w-3" /> Open in Google Maps
                </a>
              </CardContent>
            </Card>
          )}

          {/* Mesh artifact download */}
          {meshArtifactUrl && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Download className="h-4 w-4" />
                  Reconstruction Exports
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <a href={meshArtifactUrl} download>
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <Download className="h-4 w-4" /> Download OBJ Mesh
                  </Button>
                </a>
                <a href={meshArtifactUrl.replace(/\.obj$/i, ".mtl")} download>
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <Download className="h-4 w-4" /> Download MTL Material
                  </Button>
                </a>
                <Badge variant="secondary" className="text-xs">
                  Status: {project.reconstructionStatus}
                </Badge>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
