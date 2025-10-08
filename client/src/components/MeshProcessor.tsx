import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Upload, Download, FileText, Box, Weight, Ruler, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface MeshProcessingResult {
  volume: number;
  weight: number;
  vertices: number;
  faces: number;
  surfaceArea: number;
  coalType: string;
  coalDensity: number;
  fileName: string;
  fileSize: number;
  processedAt: string;
  boundingBox: {
    min: { x: number; y: number; z: number };
    max: { x: number; y: number; z: number };
  };
}

interface CoalType {
  type: string;
  density: number;
}

export function MeshProcessor() {
  const [file, setFile] = useState<File | null>(null);
  const [coalType, setCoalType] = useState<string>("bituminous");
  const [coalTypes, setCoalTypes] = useState<Record<string, CoalType>>({});
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<MeshProcessingResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Load coal types on component mount
  useState(() => {
    fetch('/api/mesh/coal-types')
      .then(res => res.json())
      .then(data => setCoalTypes(data))
      .catch(err => console.error('Failed to load coal types:', err));
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Validate file type
      const allowedTypes = ['.obj', '.ply', '.stl'];
      const fileExtension = selectedFile.name.toLowerCase().substring(selectedFile.name.lastIndexOf('.'));
      
      if (!allowedTypes.includes(fileExtension)) {
        setError(`Invalid file type. Please select a ${allowedTypes.join(', ')} file.`);
        return;
      }
      
      // Validate file size (50MB limit)
      if (selectedFile.size > 50 * 1024 * 1024) {
        setError('File size too large. Please select a file smaller than 50MB.');
        return;
      }
      
      setFile(selectedFile);
      setError(null);
      setResult(null);
    }
  };

  const processFile = async () => {
    if (!file) {
      setError('Please select a file first.');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('modelFile', file);
      formData.append('coalType', coalType);

      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 10, 90));
      }, 200);

      const response = await fetch('/api/mesh/upload', {
        method: 'POST',
        body: formData,
      });

      clearInterval(progressInterval);
      setProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Processing failed');
      }

      const data = await response.json();
      setResult(data);
      
      toast({
        title: "Processing Complete",
        description: `Successfully processed ${file.name}`,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(message);
      toast({
        title: "Processing Failed",
        description: message,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      setProgress(0);
    }
  };

  const downloadResults = () => {
    if (!result) return;

    const data = {
      fileName: result.fileName,
      processedAt: result.processedAt,
      coalType: result.coalType,
      coalDensity: result.coalDensity,
      volume: result.volume,
      weight: result.weight,
      vertices: result.vertices,
      faces: result.faces,
      surfaceArea: result.surfaceArea,
      boundingBox: result.boundingBox,
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${result.fileName}_analysis.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatNumber = (num: number, decimals: number = 2) => {
    return num.toLocaleString(undefined, { 
      minimumFractionDigits: decimals, 
      maximumFractionDigits: decimals 
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Box className="h-5 w-5" />
            3D Mesh Processing
          </CardTitle>
          <CardDescription>
            Upload your .obj, .ply, or .stl file to automatically calculate volume and weight
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label htmlFor="mesh-file">3D Model File</Label>
            <div className="border-2 border-dashed rounded-md p-6 text-center hover-elevate">
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <Input
                id="mesh-file"
                type="file"
                accept=".obj,.ply,.stl"
                onChange={handleFileChange}
                className="hidden"
              />
              <Label htmlFor="mesh-file" className="cursor-pointer">
                {file ? (
                  <div className="space-y-1">
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatFileSize(file.size)}
                    </p>
                  </div>
                ) : (
                  <p className="text-muted-foreground">
                    Click to upload .obj, .ply, or .stl file
                  </p>
                )}
              </Label>
            </div>
          </div>

          {/* Coal Type Selection */}
          <div className="space-y-2">
            <Label htmlFor="coal-type">Coal Type</Label>
            <Select value={coalType} onValueChange={setCoalType}>
              <SelectTrigger>
                <SelectValue placeholder="Select coal type" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(coalTypes).map(([key, coal]) => (
                  <SelectItem key={key} value={key}>
                    {coal.type} ({coal.density} kg/m³)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Error Display */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Processing Progress */}
          {isProcessing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Processing...</Label>
                <span className="text-sm text-muted-foreground">{progress}%</span>
              </div>
              <Progress value={progress} />
            </div>
          )}

          {/* Process Button */}
          <Button 
            onClick={processFile} 
            disabled={!file || isProcessing}
            className="w-full"
          >
            {isProcessing ? 'Processing...' : 'Process Mesh'}
          </Button>
        </CardContent>
      </Card>

      {/* Results Display */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Processing Results
              </div>
              <Button variant="outline" size="sm" onClick={downloadResults}>
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </CardTitle>
            <CardDescription>
              Analysis completed for {result.fileName}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Key Metrics */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Box className="h-5 w-5 text-blue-500" />
                    <div>
                      <p className="text-2xl font-bold">{formatNumber(result.volume)} m³</p>
                      <p className="text-sm text-muted-foreground">Volume</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-2">
                    <Weight className="h-5 w-5 text-green-500" />
                    <div>
                      <p className="text-2xl font-bold">{formatNumber(result.weight)} kg</p>
                      <p className="text-sm text-muted-foreground">Estimated Weight</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <Separator />

            {/* Detailed Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-4">
                <h4 className="font-semibold flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  File Information
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">File Name:</span>
                    <span>{result.fileName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">File Size:</span>
                    <span>{formatFileSize(result.fileSize)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Processed:</span>
                    <span>{new Date(result.processedAt).toLocaleString()}</span>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold flex items-center gap-2">
                  <Ruler className="h-4 w-4" />
                  Mesh Properties
                </h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Vertices:</span>
                    <span>{result.vertices.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Faces:</span>
                    <span>{result.faces.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Surface Area:</span>
                    <span>{formatNumber(result.surfaceArea)} m²</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Coal Information */}
            <div className="space-y-2">
              <h4 className="font-semibold">Coal Properties</h4>
              <div className="flex gap-2">
                <Badge variant="secondary">
                  {coalTypes[result.coalType]?.type || result.coalType}
                </Badge>
                <Badge variant="outline">
                  Density: {result.coalDensity} kg/m³
                </Badge>
              </div>
            </div>

            {/* Bounding Box */}
            <div className="space-y-2">
              <h4 className="font-semibold">Bounding Box (meters)</h4>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Minimum:</p>
                  <p>X: {formatNumber(result.boundingBox.min.x, 3)}</p>
                  <p>Y: {formatNumber(result.boundingBox.min.y, 3)}</p>
                  <p>Z: {formatNumber(result.boundingBox.min.z, 3)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Maximum:</p>
                  <p>X: {formatNumber(result.boundingBox.max.x, 3)}</p>
                  <p>Y: {formatNumber(result.boundingBox.max.y, 3)}</p>
                  <p>Z: {formatNumber(result.boundingBox.max.z, 3)}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}