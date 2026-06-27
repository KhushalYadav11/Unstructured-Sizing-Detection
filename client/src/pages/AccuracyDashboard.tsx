/**
 * Accuracy Dashboard — Polycam-level accuracy roadmap in one place.
 *
 * Shows:
 * 1. Current estimated reconstruction accuracy for a project
 * 2. Scale calibration tool (place two points → enter known distance)
 * 3. Photo quality checklist
 * 4. Accuracy improvement tips ranked by impact
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import {
  Target, CheckCircle2, XCircle, AlertTriangle, TrendingUp,
  Camera, Layers, Ruler, ScanLine, Info, ChevronRight,
} from "lucide-react";

// ── Accuracy tips ranked by impact ──────────────────────────────────────────
const ACCURACY_TIPS = [
  {
    impact: "Very High",
    color: "text-green-500",
    title: "Use 100–200 images with 70–80% overlap",
    description: "The single biggest factor. Walk three rings at different heights plus a top-down pass. Each area should appear in 5+ photos.",
    done: false,
  },
  {
    impact: "Very High",
    color: "text-green-500",
    title: "Enable GPS on your camera / drone",
    description: "GPS EXIF data gives ODM absolute metric scale automatically. Without it you need manual calibration, adding ±5–10% error.",
    done: false,
  },
  {
    impact: "High",
    color: "text-blue-500",
    title: "Include a scale reference object",
    description: "Place a 1-metre measuring tape, checkerboard target, or known-size pallet at the base of the pile. Use the calibration tool below.",
    done: false,
  },
  {
    impact: "High",
    color: "text-blue-500",
    title: "Shoot in overcast or diffused light",
    description: "Hard shadows create false depth cues for the matcher. Overcast is ideal. Avoid midday direct sun.",
    done: false,
  },
  {
    impact: "Medium",
    color: "text-yellow-500",
    title: "Use ultra quality settings",
    description: "Already configured. Processing is slower but yields 3–5× more point cloud density than medium quality.",
    done: true,
  },
  {
    impact: "Medium",
    color: "text-yellow-500",
    title: "Lock camera exposure and white balance",
    description: "Auto-exposure changes between shots creates inconsistent brightness that confuses the feature matcher.",
    done: false,
  },
  {
    impact: "Low",
    color: "text-muted-foreground",
    title: "Use RAW images (if available)",
    description: "RAW files contain more detail than JPEG. Convert to 16-bit TIFF for best results with ODM.",
    done: false,
  },
  {
    impact: "Low",
    color: "text-muted-foreground",
    title: "Add Ground Control Points (GCPs)",
    description: "GCPs are surveyed markers (total station or RTK GPS). Reduces error to ±1–2 cm but requires survey equipment.",
    done: false,
  },
];

// ── Polycam gap analysis ─────────────────────────────────────────────────────
const POLYCAM_GAPS = [
  {
    feature: "LiDAR depth fusion",
    polycam: "iPhone Pro LiDAR — absolute depth, ±1 cm",
    ours: "Photogrammetry only — ±3–15% depending on images",
    bridgeable: false,
    note: "Not achievable without LiDAR hardware. Use RTK drone instead.",
  },
  {
    feature: "Cloud GPU processing",
    polycam: "NVIDIA A100, 10–30 min for 200 images",
    ours: "Local CPU, 45–90 min for 100 images",
    bridgeable: true,
    note: "Run NodeODM on a cloud VM with GPU (AWS g4dn.xlarge ≈ $0.50/hr).",
  },
  {
    feature: "Gaussian Splatting",
    polycam: "Neural radiance field — photorealistic rendering",
    ours: "Textured OBJ mesh",
    bridgeable: true,
    note: "Add 3D Gaussian Splatting viewer using Three.js Gaussian Splat renderer.",
  },
  {
    feature: "GPS accuracy",
    polycam: "RTK GPS integration — ±2 cm",
    ours: "Phone GPS EXIF — ±5 m (relative accuracy ±3–5%)",
    bridgeable: true,
    note: "Use RTK-equipped drone (DJI Phantom 4 RTK) for ±2 cm absolute accuracy.",
  },
  {
    feature: "Real-time preview",
    polycam: "Shows sparse point cloud during capture",
    ours: "No capture-time feedback",
    bridgeable: true,
    note: "Implement live feature detection via WebRTC camera stream + COLMAP.",
  },
  {
    feature: "Volume calculation method",
    polycam: "DSM-minus-DTM integration",
    ours: "DSM ground-subtraction prismatoid (now implemented ✓)",
    bridgeable: true,
    note: "Already improved — matches Polycam's method.",
  },
];

// ── Scale calibration tool ──────────────────────────────────────────────────
function ScaleCalibrationTool() {
  const { toast } = useToast();
  const [form, setForm] = useState({
    ax: "", ay: "", az: "",
    bx: "", by: "", bz: "",
    dist: "",
  });
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const handleCalibrate = async () => {
    const { ax, ay, az, bx, by, bz, dist } = form;
    if (!ax || !ay || !az || !bx || !by || !bz || !dist) {
      toast({ title: "Fill all fields", variant: "destructive" });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/mesh/calibrate-scale", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pointA: { x: +ax, y: +ay, z: +az },
          pointB: { x: +bx, y: +by, z: +bz },
          realWorldDistanceMeters: +dist,
        }),
      });
      const data = await res.json();
      setResult(data);
    } catch (e) {
      toast({ title: "Calibration failed", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Ruler className="h-5 w-5 text-primary" />
          Scale Calibration
        </CardTitle>
        <CardDescription>
          If your images lack GPS, enter two mesh coordinates and the real-world distance between them to correct the scale.
          Read the coordinates from the 3D Viewer (Measurement Mode → click two points).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Point A (mesh units)</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["ax","ay","az"] as const).map((k, i) => (
                <div key={k}>
                  <Label className="text-xs text-muted-foreground">{["X","Y","Z"][i]}</Label>
                  <Input placeholder="0.0" value={form[k]} onChange={e => setForm(f => ({...f, [k]: e.target.value}))} className="font-mono text-sm" />
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Point B (mesh units)</Label>
            <div className="grid grid-cols-3 gap-2">
              {(["bx","by","bz"] as const).map((k, i) => (
                <div key={k}>
                  <Label className="text-xs text-muted-foreground">{["X","Y","Z"][i]}</Label>
                  <Input placeholder="0.0" value={form[k]} onChange={e => setForm(f => ({...f, [k]: e.target.value}))} className="font-mono text-sm" />
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="max-w-xs space-y-1">
          <Label>Known real-world distance (metres)</Label>
          <Input placeholder="e.g. 1.000" value={form.dist} onChange={e => setForm(f => ({...f, dist: e.target.value}))} className="font-mono" />
        </div>
        <Button onClick={handleCalibrate} disabled={loading} className="gap-2">
          <Target className="h-4 w-4" />
          {loading ? "Calculating…" : "Compute Scale Factor"}
        </Button>

        {result && (
          <div className="rounded-md bg-primary/5 border border-primary/20 p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Scale Factor</span>
              <span className="font-mono font-bold text-primary">{result.scaleFactor?.toFixed(6)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Mesh Distance</span>
              <span className="font-mono">{result.measuredDistanceMesh?.toFixed(4)} units</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Confidence</span>
              <Badge>{result.confidence}</Badge>
            </div>
            <p className="text-xs text-muted-foreground border-t pt-2">{result.notes}</p>
            <p className="text-xs text-yellow-600 dark:text-yellow-400">
              <AlertTriangle className="inline h-3 w-3 mr-1" />
              Apply this factor: multiply all volumes by scale³ = {Math.pow(result.scaleFactor, 3).toFixed(6)}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Accuracy estimator ───────────────────────────────────────────────────────
function AccuracyEstimator() {
  const { toast } = useToast();
  const [imageCount, setImageCount] = useState(100);
  const [hasGps, setHasGps] = useState(true);
  const [hasCalibration, setHasCalibration] = useState(false);
  const [featureQuality, setFeatureQuality] = useState<"ultra"|"high"|"medium"|"low">("ultra");
  const [result, setResult] = useState<any>(null);

  const estimate = async () => {
    try {
      const res = await fetch("/api/mesh/accuracy-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageCount, hasGps, hasManualCalibration: hasCalibration, featureQuality }),
      });
      setResult(await res.json());
    } catch (e) {
      toast({ title: "Failed", description: String(e), variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="h-5 w-5 text-primary" />
          Accuracy Estimator
        </CardTitle>
        <CardDescription>Predict measurement accuracy before you process your images</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="space-y-1">
            <Label className="text-sm">Image Count</Label>
            <Input type="number" min={10} max={500} value={imageCount}
              onChange={e => setImageCount(+e.target.value)} className="font-mono" />
          </div>
          <div className="space-y-1">
            <Label className="text-sm">Quality Setting</Label>
            <select
              value={featureQuality}
              onChange={e => setFeatureQuality(e.target.value as any)}
              className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              <option value="ultra">Ultra</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div className="flex flex-col gap-3 pt-1">
            <Label className="text-sm flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={hasGps} onChange={e => setHasGps(e.target.checked)} className="rounded" />
              Has GPS EXIF
            </Label>
            <Label className="text-sm flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={hasCalibration} onChange={e => setHasCalibration(e.target.checked)} className="rounded" />
              Manual Calibration
            </Label>
          </div>
          <div className="flex items-end">
            <Button onClick={estimate} className="w-full gap-2">
              <Target className="h-4 w-4" /> Estimate
            </Button>
          </div>
        </div>

        {result && (
          <div className="rounded-md bg-muted p-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className={`text-2xl font-bold font-mono ${
                result.linearAccuracyPercent <= 2 ? "text-green-500" :
                result.linearAccuracyPercent <= 5 ? "text-yellow-500" : "text-red-500"
              }`}>
                ±{result.linearAccuracyPercent}%
              </div>
              <div>
                <div className="text-sm font-medium">Linear accuracy</div>
                <div className="text-xs text-muted-foreground">Volume: ±{result.volumeAccuracyPercent}%</div>
              </div>
            </div>
            <Progress
              value={Math.max(0, 100 - result.linearAccuracyPercent * 8)}
              className="h-2"
            />
            <p className="text-sm text-muted-foreground">{result.description}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────
export default function AccuracyDashboard() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <Target className="h-7 w-7 text-primary" />
          Accuracy & Quality Centre
        </h1>
        <p className="text-muted-foreground mt-1">
          Tools, tips, and a gap analysis vs Polycam-level reconstruction
        </p>
      </div>

      {/* Accuracy estimator */}
      <AccuracyEstimator />

      {/* Scale calibration */}
      <ScaleCalibrationTool />

      {/* Improvement tips */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Camera className="h-5 w-5 text-primary" />
            Accuracy Improvement Checklist
          </CardTitle>
          <CardDescription>
            Ranked by impact — the top items alone will take you from ±15% to ±3%
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {ACCURACY_TIPS.map((tip, i) => (
            <div key={i} className="flex items-start gap-3 p-3 rounded-md bg-muted/40 border">
              {tip.done
                ? <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                : <div className="h-5 w-5 rounded-full border-2 border-muted-foreground mt-0.5 flex-shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-sm">{tip.title}</span>
                  <Badge
                    variant="outline"
                    className={`text-xs ${tip.color} border-current`}
                  >
                    {tip.impact} impact
                  </Badge>
                  {tip.done && <Badge variant="secondary" className="text-xs">Done ✓</Badge>}
                </div>
                <p className="text-xs text-muted-foreground mt-1">{tip.description}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Polycam gap analysis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-primary" />
            Gap Analysis vs Polycam
          </CardTitle>
          <CardDescription>
            What Polycam does differently — and how far we can close each gap
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-0 divide-y">
          {POLYCAM_GAPS.map((gap, i) => (
            <div key={i} className="py-4 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <span className="font-medium text-sm">{gap.feature}</span>
                <Badge variant={gap.bridgeable ? "default" : "secondary"}>
                  {gap.bridgeable ? "Bridgeable" : "Requires LiDAR hardware"}
                </Badge>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                <div className="bg-green-500/10 rounded p-2">
                  <span className="font-medium text-green-600 dark:text-green-400">Polycam: </span>
                  {gap.polycam}
                </div>
                <div className="bg-muted rounded p-2">
                  <span className="font-medium text-muted-foreground">Ours: </span>
                  {gap.ours}
                </div>
              </div>
              <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <ChevronRight className="h-3.5 w-3.5 mt-0.5 flex-shrink-0 text-primary" />
                {gap.note}
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Roadmap card */}
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5 text-primary" />
            3-Phase Roadmap to Polycam-Level Accuracy
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {[
            {
              phase: "Phase 1 — Now (implemented)",
              items: [
                "Ultra quality ODM settings with SGM depth maps",
                "DTM + DSM dual output for ground separation",
                "Prismatoid volume integration (ground-subtraction)",
                "Scale calibration tool",
                "GPS EXIF extraction and location mapping",
                "Mesh quality scoring (watertight check, vertex/face count)",
                "Texture loading with MTL in 3D viewer",
                "Detailed processing stage labels",
              ],
              color: "text-green-500",
              icon: CheckCircle2,
            },
            {
              phase: "Phase 2 — Next sprint",
              items: [
                "RTK drone integration (DJI SDK → automatic GCPs)",
                "Multi-spectral image support (NDVI for pile condition)",
                "Automated GCP detection from ArUco markers in photos",
                "Volume comparison between two reconstruction dates",
                "PDF report with accuracy confidence intervals",
                "NodeODM on cloud GPU (AWS g4dn or Lambda Labs)",
              ],
              color: "text-yellow-500",
              icon: AlertTriangle,
            },
            {
              phase: "Phase 3 — Future",
              items: [
                "3D Gaussian Splatting renderer (photorealistic, no mesh needed)",
                "LiDAR USB dongle support (Livox Mid-360 for desktop scanning)",
                "Neural implicit surface reconstruction (instant-ngp)",
                "Live sparse point cloud preview during capture (mobile app)",
                "Automated stock change detection with AI anomaly flagging",
              ],
              color: "text-muted-foreground",
              icon: Info,
            },
          ].map(({ phase, items, color, icon: Icon }) => (
            <div key={phase} className="space-y-2">
              <div className={`flex items-center gap-2 font-semibold text-sm ${color}`}>
                <Icon className="h-4 w-4" />
                {phase}
              </div>
              <ul className="space-y-1 pl-6">
                {items.map((item, j) => (
                  <li key={j} className="text-sm text-muted-foreground flex items-start gap-1.5">
                    <ChevronRight className="h-3.5 w-3.5 mt-0.5 flex-shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
              {phase !== "Phase 3 — Future" && <Separator />}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
