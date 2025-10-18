import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Ruler, Save, Scale } from "lucide-react";
import { COAL_TYPES } from "@/components/CoalTypeSelector";

interface MeasurementPanelProps {
  onSave?: (data: MeasurementData) => void;
}

export interface MeasurementData {
  length: number;
  width: number;
  height: number;
  unit: string;
  coalType?: string;
  weight?: number;
}

export function MeasurementPanel({ onSave }: MeasurementPanelProps) {
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [unit, setUnit] = useState("meters");
  const [coalType, setCoalType] = useState("bituminous");
  const [weight, setWeight] = useState<number | null>(null);

  // Calculate weight whenever dimensions or coal type changes
  useEffect(() => {
    calculateWeight();
  }, [length, width, height, coalType]);

  const calculateWeight = () => {
    const l = parseFloat(length) || 0;
    const w = parseFloat(width) || 0;
    const h = parseFloat(height) || 0;
    
    if (l > 0 && w > 0 && h > 0) {
      const volume = l * w * h; // in cubic meters
      const selectedCoal = COAL_TYPES.find(coal => coal.id === coalType);
      if (selectedCoal) {
        // Convert kg from m³ × kg/m³ and then to grams
        const weightInGrams = volume * selectedCoal.density * 1000;
        setWeight(weightInGrams);
      }
    } else {
      setWeight(null);
    }
  };

  const handleSave = () => {
    const data: MeasurementData = {
      length: parseFloat(length) || 0,
      width: parseFloat(width) || 0,
      height: parseFloat(height) || 0,
      unit,
      coalType,
      weight: weight || undefined,
    };
    onSave?.(data);
    console.log("Measurement saved:", data);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ruler className="h-5 w-5" />
          Dimensions
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="length">Length</Label>
          <div className="flex gap-2">
            <Input
              id="length"
              type="number"
              placeholder="0.00"
              value={length}
              onChange={(e) => setLength(e.target.value)}
              className="font-mono"
              data-testid="input-length"
            />
            <Select value={unit} onValueChange={setUnit}>
              <SelectTrigger className="w-28" data-testid="select-unit">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="meters">m</SelectItem>
                <SelectItem value="feet">ft</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="width">Width</Label>
          <Input
            id="width"
            type="number"
            placeholder="0.00"
            value={width}
            onChange={(e) => setWidth(e.target.value)}
            className="font-mono"
            data-testid="input-width"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="height">Height</Label>
          <Input
            id="height"
            type="number"
            placeholder="0.00"
            value={height}
            onChange={(e) => setHeight(e.target.value)}
            className="font-mono"
            data-testid="input-height"
          />
        </div>

        <Button
          className="w-full"
          onClick={handleSave}
          data-testid="button-save-measurement"
        >
          <Save className="h-4 w-4 mr-2" />
          Save Measurement
        </Button>
        {/* Coal Type Selection */}
        <div className="space-y-2">
          <Label htmlFor="coal-type">Coal Type</Label>
          <Select value={coalType} onValueChange={setCoalType} data-testid="select-coal-type">
            <SelectTrigger id="coal-type">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COAL_TYPES.map((coal) => (
                <SelectItem key={coal.id} value={coal.id}>
                  {coal.name} ({coal.density} kg/m³)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Weight Display */}
        {weight !== null && (
          <div className="rounded-md bg-muted p-3 space-y-1">
            <div className="flex items-center gap-2">
              <Scale className="h-4 w-4 text-primary" />
              <div className="text-sm text-muted-foreground">Estimated Weight</div>
            </div>
            <div className="text-xl font-mono font-semibold" data-testid="text-estimated-weight">
              {weight.toLocaleString(undefined, { maximumFractionDigits: 0 })} g
            </div>
            <div className="text-xs text-muted-foreground pt-1">
              Based on {COAL_TYPES.find(c => c.id === coalType)?.name} density
            </div>
          </div>
        )}

        <Button
          className="w-full"
          onClick={handleSave}
          data-testid="button-save-measurement"
        >
          <Save className="h-4 w-4 mr-2" />
          Save Measurement
        </Button>
      </CardContent>
    </Card>
  );
}
