import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Mountain } from "lucide-react";
import { COAL_TYPES as SHARED_COAL_TYPES } from "@shared/schema";

export const COAL_TYPES = Object.entries(SHARED_COAL_TYPES).map(([id, cfg]) => ({
  id,
  name: cfg.name,
  density: cfg.density,
}));

interface CoalTypeSelectorProps {
  value?: string;
  onChange?: (value: string) => void;
}

export function CoalTypeSelector({ value, onChange }: CoalTypeSelectorProps) {
  const selectedCoal = COAL_TYPES.find((c) => c.id === value);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Mountain className="h-5 w-5" />
          Coal Type
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="coal-type">Select Type</Label>
          <Select value={value} onValueChange={onChange}>
            <SelectTrigger id="coal-type" data-testid="select-coal-type">
              <SelectValue placeholder="Choose coal type" />
            </SelectTrigger>
            <SelectContent>
              {COAL_TYPES.map((coal) => (
                <SelectItem key={coal.id} value={coal.id}>
                  {coal.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedCoal && (
          <div className="rounded-md bg-muted p-3 space-y-1">
            <div className="text-sm text-muted-foreground">Density</div>
            <div
              className="text-2xl font-mono font-semibold"
              data-testid="text-coal-density"
            >
              {selectedCoal.density} kg/m³
            </div>
            <div className="text-xs text-muted-foreground pt-1">
              Used for weight calculation: Weight = Volume × Density
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
