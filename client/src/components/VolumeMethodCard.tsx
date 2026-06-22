import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Calculator } from "lucide-react";

export const VOLUME_METHODS = [
  {
    id: "truncated-pyramid",
    name: "Truncated Pyramid",
    accuracy: 90,
    description: "Most accurate for conical piles",
  },
  {
    id: "ellipsoid",
    name: "Ellipsoid Approximation",
    accuracy: 85,
    description: "Good for rounded piles",
  },
  {
    id: "conical",
    name: "Conical Approximation",
    accuracy: 80,
    description: "Simple cone shape",
  },
  {
    id: "rectangular",
    name: "Rectangular with Fill Factor",
    accuracy: 75,
    description: "Basic estimation",
  },
];

interface VolumeMethodCardProps {
  value?: string;
  onChange?: (value: string) => void;
  calculatedVolume?: number;
}

export function VolumeMethodCard({
  value,
  onChange,
  calculatedVolume,
}: VolumeMethodCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calculator className="h-5 w-5" />
          Volume Calculation Method
        </CardTitle>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        <RadioGroup value={value} onValueChange={onChange}>
          {VOLUME_METHODS.map((method) => (
            <div
              key={method.id}
              className="flex items-start space-x-3 rounded-md border p-3 hover-elevate"
            >
              <RadioGroupItem
                value={method.id}
                id={method.id}
                data-testid={`radio-method-${method.id}`}
              />
              <div className="flex-1 space-y-1">
                <Label
                  htmlFor={method.id}
                  className="text-sm font-medium leading-none cursor-pointer flex items-center gap-2 flex-wrap"
                >
                  {method.name}
                  <Badge variant="secondary" className="text-xs">
                    {method.accuracy}% accuracy
                  </Badge>
                </Label>
                <p className="text-xs text-muted-foreground">
                  {method.description}
                </p>
              </div>
            </div>
          ))}
        </RadioGroup>

        {calculatedVolume !== undefined && (
          <div className="rounded-md bg-primary/10 border border-primary/20 p-4 mt-4">
            <div className="text-sm text-muted-foreground mb-1">
              Calculated Volume
            </div>
            <div
              className="text-3xl font-mono font-bold text-primary"
              data-testid="text-calculated-volume"
            >
              {calculatedVolume.toFixed(2)} m³
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
