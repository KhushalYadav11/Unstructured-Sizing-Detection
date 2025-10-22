import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { ThreeDViewer } from "@/components/ThreeDViewer";
import { MeasurementPanel, type MeasurementData } from "@/components/MeasurementPanel";
import { CoalTypeSelector, COAL_TYPES } from "@/components/CoalTypeSelector";
import { VolumeMethodCard, VOLUME_METHODS } from "@/components/VolumeMethodCard";
import { QualityBadge } from "@/components/QualityBadge";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Save, Download } from "lucide-react";
import { useRoute } from "wouter";
import { getProject, createMeasurement, calculate } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";

export default function Measurement() {
  const [, params] = useRoute("/measurement/:id");
  const { toast } = useToast();
  const [measurementMode, setMeasurementMode] = useState(false);
  const [coalType, setCoalType] = useState("bituminous");
  const [volumeMethod, setVolumeMethod] = useState("truncated-pyramid");
  const [dimensions, setDimensions] = useState<MeasurementData | null>(null);
  const [calculatedData, setCalculatedData] = useState<{
    volume: number;
    weight: number;
    quality: string;
    coalDensity: number;
  } | null>(null);
  const [weightUnit, setWeightUnit] = useState<'grams'|'tons'>("grams");

  const { data: project, isLoading } = useQuery({
    queryKey: ["/api/projects", params?.id],
    queryFn: () => getProject(params?.id || ""),
    enabled: !!params?.id,
  });

  const createMutation = useMutation({
    mutationFn: createMeasurement,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/projects"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/analytics/overview"] });
      toast({
        title: "Measurement saved",
        description: "Your measurement has been saved successfully.",
      });
      setDimensions(null);
      setCalculatedData(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save measurement. Please try again.",
        variant: "destructive",
      });
    },
  });

  // Auto-calculate when dimensions change
  useEffect(() => {
    if (dimensions && dimensions.length > 0 && dimensions.width > 0 && dimensions.height > 0) {
      calculate({
        length: dimensions.length,
        width: dimensions.width,
        height: dimensions.height,
        coalType,
        volumeMethod,
      })
        .then((result) => {
          setCalculatedData({
            volume: result.volume,
            weight: result.weight,
            quality: result.quality,
            coalDensity: result.coalDensity,
          });
        })
        .catch((error) => {
          toast({
            title: "Calculation Error",
            description: error instanceof Error ? error.message : "Failed to calculate volume and weight.",
            variant: "destructive",
          });
        });
    }
  }, [dimensions, coalType, volumeMethod, toast]);

  const handleSaveMeasurement = () => {
    if (!params?.id || !dimensions || !calculatedData) return;

    const selectedCoal = COAL_TYPES.find((c) => c.id === coalType);
    if (!selectedCoal) return;

    createMutation.mutate({
      projectId: params.id,
      length: dimensions.length,
      width: dimensions.width,
      height: dimensions.height,
      unit: dimensions.unit,
      coalType,
      coalDensity: selectedCoal.density,
      volumeMethod,
      calculatedVolume: calculatedData.volume,
      calculatedWeight: calculatedData.weight,
      quality: calculatedData.quality as "excellent" | "good" | "fair" | "poor",
    });
  };

  if (isLoading) {
    return (
      <div className="h-full flex flex-col gap-6">
        <Skeleton className="h-12 w-96" />
        <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 flex-1">
          <Skeleton className="lg:col-span-7 h-full" />
          <div className="lg:col-span-3 space-y-6">
            <Skeleton className="h-64" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Project not found</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{project.name}</h1>
          <div className="flex items-center gap-2 mt-1">
            <Badge variant="secondary" data-testid="badge-project-id">
              Project #{project.id.slice(0, 8)}
            </Badge>
            {calculatedData && (
              <QualityBadge rating={calculatedData.quality as any} />
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={!calculatedData || createMutation.isPending}
            onClick={handleSaveMeasurement}
            data-testid="button-save-draft"
          >
            <Save className="h-4 w-4 mr-2" />
            {createMutation.isPending ? "Saving..." : "Save Measurement"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-6 flex-1 min-h-0">
        <div className="lg:col-span-7 h-[600px] lg:h-auto">
          <ThreeDViewer
            modelLoaded={true}
            measurementMode={measurementMode}
            onMeasurementToggle={() => setMeasurementMode(!measurementMode)}
            onModelMetrics={(m) =>
              setDimensions({
                length: m.dimensions.length,
                width: m.dimensions.width,
                height: m.dimensions.height,
                unit: "meters",
              })
            }
          />
        </div>

        <div className="lg:col-span-3 space-y-6 overflow-y-auto">
          <MeasurementPanel onSave={setDimensions} />

          <CoalTypeSelector value={coalType} onChange={setCoalType} />

          <VolumeMethodCard
            value={volumeMethod}
            onChange={setVolumeMethod}
            calculatedVolume={calculatedData?.volume}
          />

          {calculatedData && (
            <Card>
              <CardHeader>
                <CardTitle>Estimated Weight</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div
                    className="text-3xl font-mono font-bold text-primary"
                    data-testid="text-estimated-weight"
                  >
                    {weightUnit === 'grams'
                      ? (calculatedData.weight * 1000).toLocaleString(undefined, { maximumFractionDigits: 0 }) + ' g'
                      : (calculatedData.weight / 1000).toLocaleString(undefined, { maximumFractionDigits: 3 }) + ' t'}
                  </div>
                  <Select value={weightUnit} onValueChange={(v) => setWeightUnit(v as 'grams'|'tons')}>
                    <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="grams">Grams</SelectItem>
                      <SelectItem value="tons">Metric Tons</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {weightUnit === 'grams' ? 'Grams' : 'Metric tons'} (Volume × Density: {calculatedData.coalDensity} kg/m³)
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
