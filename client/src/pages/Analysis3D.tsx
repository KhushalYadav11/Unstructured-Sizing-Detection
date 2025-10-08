import { useState, useRef, Suspense, useEffect } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF, Environment, Grid } from "@react-three/drei";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import * as THREE from "three";
import { 
  Upload, 
  FileUp, 
  Scale, 
  Box as BoxIcon, 
  Ruler, 
  RotateCcw, 
  Download, 
  Loader2,
  ArrowLeft
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { uploadMeshFile, processMesh, saveMeasurement } from "@/lib/mesh-api";
import { useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";

export default function Analysis3D() {
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [fileId, setFileId] = useState<string | null>(null);
  const [density, setDensity] = useState(1.3); // Default coal density in g/cm³
  const [results, setResults] = useState<{
    id?: string;
    volume: number;
    weight: number;
    surfaceArea: number;
    quality?: string;
    meshUrl?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  
  // Extract project ID from URL if present
  const urlParams = new URLSearchParams(window.location.search);
  const projectId = urlParams.get('project');

  // Upload mutation
  const uploadMutation = useMutation({
    mutationFn: (file: File) => uploadMeshFile(file),
    onSuccess: (data) => {
      setFileId(data.fileId);
      setModelUrl(data.url);
      toast({
        title: "Upload successful",
        description: "3D model uploaded successfully. Processing will begin automatically.",
      });
      // Auto-start processing
      if (data.fileId) {
        processMutation.mutate({
          fileId: data.fileId,
          density
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Upload failed",
        description: error.message || "There was an error uploading your 3D model.",
        variant: "destructive",
      });
    }
  });

  // Process mutation
  const processMutation = useMutation({
    mutationFn: ({ fileId, density }: { fileId: string, density: number }) => 
      processMesh(fileId, { density, projectId }),
    onSuccess: (data) => {
      setResults({
        id: data.id,
        volume: data.volume,
        weight: data.weight,
        surfaceArea: data.surfaceArea,
        quality: data.quality,
        meshUrl: data.meshUrl
      });
      toast({
        title: "Processing complete",
        description: "3D model has been analyzed for volume and weight estimation.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Processing failed",
        description: error.message || "There was an error processing your 3D model.",
        variant: "destructive",
      });
    }
  });
  
  // Save measurement mutation
  const saveMeasurementMutation = useMutation({
    mutationFn: (data: { projectId: string }) => {
      if (!results || !results.id) throw new Error("No results to save");
      return saveMeasurement(results.id, data.projectId);
    },
    onSuccess: () => {
      toast({
        title: "Results saved",
        description: "Measurement has been saved to the project.",
      });
      
      // Redirect to project page if project ID is available
      if (projectId) {
        setLocation(`/measurement/${projectId}`);
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Save failed",
        description: error.message || "There was an error saving the measurement.",
        variant: "destructive",
      });
    }
  });

  const handleSaveResults = async () => {
    if (!results || !results.id) return;
    
    if (projectId) {
      saveMeasurementMutation.mutate({
        projectId
      });
    } else {
      toast({
        title: "No project selected",
        description: "Please select a project first to save results.",
        variant: "destructive"
      });
    }
  };

  const isUploading = uploadMutation.isPending;
  const isProcessing = processMutation.isPending;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Only accept .obj, .ply, .stl, .glb files
    const validTypes = ['.obj', '.ply', '.stl', '.glb'];
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!validTypes.includes(fileExt)) {
      toast({
        title: "Invalid file format",
        description: "Please upload .obj, .ply, .stl, or .glb files only.",
        variant: "destructive",
      });
      return;
    }

    // Upload the file to the server
    uploadMutation.mutate(file);
  };

  const handleDensityChange = (value: number[]) => {
    const newDensity = value[0];
    setDensity(newDensity);
    
    // Update weight calculation if we have results
    if (results) {
      setResults({
        ...results,
        weight: results.volume * newDensity,
      });
    }
  };

  const handleReprocess = () => {
    if (!fileId) return;
    
    // Process with new density
    processMutation.mutate({
      fileId,
      density
    });
    
    toast({
      title: "Reprocessing model",
      description: `Recalculating with density: ${density} t/m³`,
    });
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const resetModel = () => {
    setModelUrl(null);
    setResults(null);
    setFileId(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex flex-col gap-2">
        {projectId && (
          <Button 
            variant="outline" 
            className="self-start" 
            onClick={() => setLocation(`/projects`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Projects
          </Button>
        )}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">3D Mesh Analysis</h1>
            {projectId && (
              <p className="text-muted-foreground">
                Results will be saved to the selected project
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={triggerFileInput}
              disabled={isUploading || isProcessing}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Model
                </>
              )}
            </Button>
            <Input
              ref={fileInputRef}
              type="file"
              accept=".obj,.ply,.stl,.glb"
              className="hidden"
              onChange={handleFileChange}
              disabled={isUploading || isProcessing}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <Card className="h-[600px] overflow-hidden">
            <CardContent className="p-0 h-full">
              {modelUrl ? (
                <Canvas camera={{ position: [0, 2, 5], fov: 50 }}>
                  <ambientLight intensity={0.5} />
                  <spotLight position={[10, 10, 10]} angle={0.15} penumbra={1} />
                  <Suspense fallback={null}>
                    <Model url={modelUrl} />
                    <Environment preset="city" />
                  </Suspense>
                  <OrbitControls />
                  <Grid infiniteGrid fadeDistance={30} fadeStrength={5} />
                </Canvas>
              ) : (
                <div className="flex flex-col items-center justify-center h-full bg-muted/40">
                  <BoxIcon className="h-16 w-16 mb-4 text-muted-foreground" />
                  <h3 className="text-xl font-medium mb-2">No 3D Model Loaded</h3>
                  <p className="text-muted-foreground text-center max-w-md mb-6">
                    Upload a 3D model (.obj, .ply, .stl, .glb) to visualize and analyze coal volume
                  </p>
                  <Button onClick={triggerFileInput} disabled={isUploading}>
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Uploading...
                      </>
                    ) : (
                      <>
                        <Upload className="h-4 w-4 mr-2" />
                        Upload 3D Model
                      </>
                    )}
                  </Button>
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                    accept=".obj,.ply,.stl,.glb"
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Analysis Controls</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {modelUrl ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="density">Material Density (tonnes/m³)</Label>
                    <div className="flex items-center space-x-2">
                      <Slider
                        id="density"
                        min={0.5}
                        max={2.5}
                        step={0.1}
                        value={[density]}
                        onValueChange={handleDensityChange}
                      />
                      <span className="w-12 text-right">{density.toFixed(1)}</span>
                    </div>
                  </div>
                  
                  <Separator />
                  
                  <div className="space-y-4">
                    <div>
                      <Label>Status</Label>
                      {isProcessing ? (
                        <div className="flex items-center mt-1 text-amber-500">
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          Processing model...
                        </div>
                      ) : results ? (
                        <div className="flex items-center mt-1 text-green-500">
                          Processing complete
                        </div>
                      ) : (
                        <div className="flex items-center mt-1">
                          Ready for analysis
                        </div>
                      )}
                    </div>
                    
                    <div className="flex space-x-2">
                      <Button variant="outline" onClick={resetModel} className="flex-1">
                        <RotateCcw className="h-4 w-4 mr-2" />
                        Reset
                      </Button>
                      <Button className="flex-1" disabled={!results}>
                        <Download className="h-4 w-4 mr-2" />
                        Export
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">
                    Upload a 3D model to access analysis controls
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {results && (
            <Card>
              <CardHeader>
                <CardTitle>Measurement Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Volume</Label>
                    <p className="text-2xl font-semibold">{results.volume.toFixed(1)} m³</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Weight</Label>
                    <p className="text-2xl font-semibold">{(results.weight).toFixed(1)} t</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Surface Area</Label>
                    <p className="text-2xl font-semibold">{results.surfaceArea.toFixed(1)} m²</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-muted-foreground">Density</Label>
                    <p className="text-2xl font-semibold">{density.toFixed(1)} t/m³</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// 3D Model component
function Model({ url }: { url: string }) {
  const { scene } = useGLTF(url);
  const { camera } = useThree();
  
  useState(() => {
    // This would normally calculate bounding box and center/scale the model
    // For simplicity, we're just adjusting the camera
    camera.position.set(0, 1, 3);
    camera.lookAt(0, 0, 0);
  });
  
  return <primitive object={scene} />;
}