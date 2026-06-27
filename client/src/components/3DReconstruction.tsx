import React, { useState, useEffect, useRef, Suspense } from "react";
import { useLocation } from "wouter";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, useProgress, Html, Stage } from "@react-three/drei";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader";
import { processMeshByUrl } from "@/lib/mesh-api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import {
  Upload,
  ScanLine,
  CheckCircle2,
  XCircle,
  Loader2,
  Download,
  BarChart3,
  RotateCcw,
  AlertTriangle,
  Layers,
  Box,
  Weight,
  Ruler,
  Terminal,
  WifiOff,
  FolderOpen,
} from "lucide-react";

// ─── Stage labels from ODM progress ───────────────────────────────────────────
const ODM_STAGE_LABELS: Record<number, string> = {
  0:  "Queued",
  5:  "Uploading images",
  10: "Detecting features",
  20: "Matching features",
  30: "Reconstructing sparse cloud",
  40: "Optimising camera positions",
  50: "Building dense cloud",
  60: "Filtering point cloud",
  70: "Building mesh",
  80: "Texturing model",
  88: "Generating DSM",
  90: "Finalising outputs",
  100: "Complete",
};

function getStageName(progress: number | null): string {
  if (progress === null) return "Initialising…";
  const keys = Object.keys(ODM_STAGE_LABELS).map(Number).sort((a, b) => a - b);
  let label = "Processing…";
  for (const k of keys) {
    if (progress >= k) label = ODM_STAGE_LABELS[k];
  }
  return label;
}

// ─── Three.js loader component ────────────────────────────────────────────────
function CanvasLoader() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div className="flex flex-col items-center gap-2 text-white">
        <Loader2 className="h-8 w-8 animate-spin" />
        <span className="text-sm">{Math.round(progress)}%</span>
      </div>
    </Html>
  );
}

// ── Shared texture loader — works for both ODM output and reference models ────
// Upgrades MeshPhongMaterial (from MTLLoader) to MeshStandardMaterial so
// textures render correctly under Three.js PBR lighting. Strips broken bump/
// specular setup that causes dark/invisible materials.
async function loadObjWithTextures(
  meshUrl: string,
  resourcePath: string
): Promise<THREE.Group> {
  const mtlUrl = meshUrl.replace(/\.obj$/i, ".mtl");

  let mtlText = "";
  try { mtlText = await fetch(mtlUrl).then(r => r.text()); } catch {}

  // Pre-load all map_Kd textures directly via TextureLoader (avoids MTLLoader
  // path resolution bugs with relative filenames)
  const diffuseMap: Record<string, THREE.Texture> = {};
  const mapKdMatches = [...mtlText.matchAll(/map_Kd\s+(\S+)/gi)];
  for (const m of mapKdMatches) {
    const name = m[1].trim();
    if (diffuseMap[name]) continue;
    try {
      const tex = await new Promise<THREE.Texture>((res, rej) =>
        new THREE.TextureLoader().load(resourcePath + name, res, undefined, rej)
      );
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.needsUpdate = true;
      diffuseMap[name] = tex;
    } catch {}
  }

  // Map material name → diffuse texture from the MTL blocks
  const matToTex: Record<string, THREE.Texture | null> = {};
  const blocks = mtlText.split(/(?=newmtl\s)/i);
  for (const block of blocks) {
    const nameMatch = block.match(/newmtl\s+(\S+)/i);
    if (!nameMatch) continue;
    const kdMatch = block.match(/map_Kd\s+(\S+)/i);
    matToTex[nameMatch[1]] = kdMatch ? (diffuseMap[kdMatch[1].trim()] ?? null) : null;
  }

  // Use MTLLoader only for face→material group assignment
  let mtlMats: any = null;
  if (mtlText) {
    try {
      const loader = new MTLLoader();
      loader.setPath(resourcePath);
      loader.setResourcePath(resourcePath);
      mtlMats = await new Promise<any>((res, rej) =>
        loader.load(mtlUrl, res, undefined, rej)
      );
      mtlMats.preload();
    } catch {}
  }

  const objLoader = new OBJLoader();
  if (mtlMats) objLoader.setMaterials(mtlMats);
  const group = await new Promise<THREE.Group>((res, rej) =>
    objLoader.load(meshUrl, res, undefined, rej)
  );

  // Upgrade every material to PBR MeshStandardMaterial with diffuse texture
  const firstTex = Object.values(diffuseMap)[0] ?? null;
  group.traverse(child => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;
    const upgrade = (old: THREE.Material): THREE.Material => {
      let map: THREE.Texture | null =
        matToTex[old.name] ??
        (old as THREE.MeshPhongMaterial).map ??
        firstTex;
      if (map) { map.colorSpace = THREE.SRGBColorSpace; map.needsUpdate = true; }
      const std = new THREE.MeshStandardMaterial({
        name: old.name, map, roughness: 0.8, metalness: 0.0, side: THREE.FrontSide,
      });
      old.dispose();
      return std;
    };
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(upgrade)
      : upgrade(mesh.material);
  });

  return group;
}

function ObjModel({ objUrl, baseUrl }: { objUrl: string; baseUrl: string }) {
  const [obj, setObj] = useState<THREE.Group | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setObj(null);
    setError(null);

    const resourcePath = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";

    const load = async () => {
      // ── 1. GLB first — textures embedded, most reliable ───────────────
      const glbUrl = objUrl.replace(/\.obj$/i, ".glb");
      try {
        const glbRes = await fetch(glbUrl, { method: "HEAD" });
        if (glbRes.ok) {
          const { GLTFLoader } = await import("three/examples/jsm/loaders/GLTFLoader");
          const gltf = await new Promise<any>((resolve, reject) =>
            new GLTFLoader().load(glbUrl, resolve, undefined, reject)
          );
          gltf.scene.traverse((child: THREE.Object3D) => {
            if ((child as THREE.Mesh).isMesh) {
              const mats = Array.isArray((child as THREE.Mesh).material)
                ? (child as THREE.Mesh).material as THREE.Material[]
                : [(child as THREE.Mesh).material as THREE.Material];
              mats.forEach((m: any) => {
                ["map","emissiveMap","normalMap","roughnessMap","metalnessMap"].forEach(k => {
                  if (m[k]) { m[k].colorSpace = THREE.SRGBColorSpace; m[k].needsUpdate = true; }
                });
              });
            }
          });
          if (!cancelled) { setObj(gltf.scene); return; }
        }
      } catch {}

      // ── 2. OBJ + MTL with PBR material upgrade ────────────────────────
      const mtlUrl = objUrl.replace(/\.obj$/i, ".mtl");
      try {
        const mtlRes = await fetch(mtlUrl, { method: "HEAD" });
        if (mtlRes.ok) {
          const loaded = await loadObjWithTextures(objUrl, resourcePath);
          if (!cancelled) { setObj(loaded); return; }
        }
      } catch {}

      // ── 3. Plain OBJ fallback ─────────────────────────────────────────
      try {
        const loaded = await new Promise<THREE.Group>((resolve, reject) =>
          new OBJLoader().load(objUrl, resolve, undefined, reject)
        );
        loaded.traverse(child => {
          if ((child as THREE.Mesh).isMesh) {
            (child as THREE.Mesh).material = new THREE.MeshStandardMaterial({
              color: 0x5a4f3e, roughness: 0.85, metalness: 0.05,
            });
          }
        });
        if (!cancelled) setObj(loaded);
      } catch (e) {
        if (!cancelled) setError(String(e));
      }
    };

    load();
    return () => { cancelled = true; };
  }, [objUrl, baseUrl]);

  if (error) return (
    <Html center>
      <div className="text-red-400 text-sm text-center px-4">
        Failed to load model: {error}
      </div>
    </Html>
  );

  if (!obj) return <CanvasLoader />;

  return <primitive object={obj} />;
}

// ─── Coal type densities ───────────────────────────────────────────────────────
const COAL_TYPES = [
  { id: "bituminous",     label: "Bituminous",      density: 1300 },
  { id: "anthracite",     label: "Anthracite",       density: 1500 },
  { id: "sub-bituminous", label: "Sub-bituminous",   density: 1200 },
  { id: "lignite",        label: "Lignite",          density: 1100 },
  { id: "coking",         label: "Coking Coal",      density: 1350 },
  { id: "thermal",        label: "Thermal Coal",     density: 1250 },
];

// ─── Main component ────────────────────────────────────────────────────────────
export default function Reconstruction() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [files, setFiles] = useState<FileList | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [progress, setProgress] = useState<number | null>(null);
  const [currentStep, setCurrentStep] = useState<string | null>(null);
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [modelBaseUrl, setModelBaseUrl] = useState<string>("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [coalType, setCoalType] = useState("bituminous");
  const [failureMessage, setFailureMessage] = useState<string | null>(null);
  const [setupCommand, setSetupCommand] = useState<string | null>(null);
  // Scale calibration — for GPS-less reconstructions
  const [knownLengthMeters, setKnownLengthMeters] = useState<string>("");
  const [scaleFactor, setScaleFactor] = useState<number | null>(null);
  // Project name for saving
  const [projectName, setProjectName] = useState<string>("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedCoal = COAL_TYPES.find((c) => c.id === coalType) ?? COAL_TYPES[0];

  // ── Polling ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(`/api/reconstruct/${jobId}?t=${Date.now()}`, { cache: "no-store" });
        if (!res.ok) { if (!cancelled) setTimeout(poll, 2500); return; }
        const data = await res.json();
        const job = data.job;
        if (!job) { if (!cancelled) setTimeout(poll, 2500); return; }

        setStatus(job.status ?? "unknown");
        if (typeof job.progress === "number") setProgress(job.progress);
        if (job.currentStep) setCurrentStep(job.currentStep);

        if (job.status === "succeeded") {
          const meshUrl = job.artifacts?.mesh?.url;
          if (meshUrl) {
            const base = meshUrl.substring(0, meshUrl.lastIndexOf("/") + 1);
            // Prefer GLB over OBJ — GLB embeds textures so they always display correctly
            const glbUrl = meshUrl.replace(/\.obj$/i, ".glb");
            try {
              const glbCheck = await fetch(glbUrl, { method: "HEAD" });
              if (glbCheck.ok) {
                setModelUrl(glbUrl);
                setModelBaseUrl(base);
                return;
              }
            } catch {}
            setModelUrl(meshUrl);
            setModelBaseUrl(base);
            return;
          }
          // Fallback path scan
          const pid = job.projectId;
          if (pid) {
            const tryUrls = [
              `/uploads/projects/${pid}/reconstruction/odm_textured_model_geo.glb`,
              `/uploads/projects/${pid}/reconstruction/odm_textured_model_geo.obj`,
              `/uploads/projects/${pid}/reconstruction/odm_output/odm_texturing/odm_textured_model_geo.obj`,
              `/uploads/projects/${pid}/reconstruction/mesh.obj`,
            ];
            for (const u of tryUrls) {
              try {
                const r = await fetch(u, { method: "HEAD" });
                if (r.ok) {
                  setModelUrl(u);
                  setModelBaseUrl(u.substring(0, u.lastIndexOf("/") + 1));
                  return;
                }
              } catch {}
            }
          }
          if (!cancelled) setTimeout(poll, 1000);
          return;
        }

        if (job.status === "failed") return;
        if (!cancelled) setTimeout(poll, 2500);
      } catch {
        if (!cancelled) setTimeout(poll, 2500);
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [jobId]);

  // Auto-analyze once model is loaded
  useEffect(() => {
    if (modelUrl && !analysis && !analyzing) {
      autoAnalyze(modelUrl);
      fetchQuality(modelUrl);
    }
  }, [modelUrl]);

  const [quality, setQuality] = useState<any | null>(null);

  const fetchQuality = async (url: string) => {
    try {
      const res = await fetch("/api/mesh/quality", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meshUrl: url }),
      });
      if (res.ok) setQuality(await res.json());
    } catch {}
  };

  const autoAnalyze = async (url: string, sf?: number) => {
    try {
      setAnalyzing(true);
      const activeSf = sf ?? scaleFactor ?? undefined;
      const res = await processMeshByUrl(
        url,
        coalType,
        activeSf ? { scaleFactor: activeSf } : undefined
      );
      setAnalysis(res);
      if (res.scaleFactor && res.scaleFactor !== 1.0) {
        setScaleFactor(res.scaleFactor);
      }

      // Patch the project record with computed dimensions so it shows up
      // correctly on the Projects page
      const pid = projectId;
      if (pid && res.dimensions) {
        try {
          await fetch(`/api/projects/${pid}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status: "completed",
              length: res.dimensions.length,
              width: res.dimensions.width,
              height: res.dimensions.height,
              volume: res.volume,
              weight: res.weight,
              meshFileName: url.split("/").pop() ?? "model.obj",
            }),
          });
        } catch {
          // Non-fatal — dimensions are still shown in the UI
        }
      }
    } catch {
      // Silently fail — user can retry manually
    } finally {
      setAnalyzing(false);
    }
  };

  // ── Submit ─────────────────────────────────────────────────────────────────
  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files || files.length === 0) {
      toast({ title: "No images selected", description: "Please choose images to reconstruct.", variant: "destructive" });
      return;
    }

    const form = new FormData();
    const pid = `project_${Date.now()}`;
    form.append("projectId", pid);
    if (projectName.trim()) form.append("projectName", projectName.trim());
    for (let i = 0; i < files.length; i++) form.append("images", files[i]);

    setStatus("uploading");
    setProgress(0);
    setValidationWarnings([]);
    setAnalysis(null);
    setModelUrl(null);
    setFailureMessage(null);
    setSetupCommand(null);

    try {
      const res = await fetch("/api/reconstruct", { method: "POST", body: form });
      const body = await res.json();

      if (!res.ok) {
        setStatus("error");
        if (body.warnings) setValidationWarnings(body.warnings);

        // Surface NodeODM setup instructions if the engine isn't running
        if (res.status === 503 && body.setupCommand) {
          setFailureMessage(body.message || body.error);
          setSetupCommand(body.setupCommand);
        }

        toast({ title: "Failed to start reconstruction", description: body.error ?? body.message, variant: "destructive" });
        return;
      }

      setJobId(body.jobId ?? null);
      setProjectId(body.projectId ?? pid);
      setStatus("queued");
      if (body.validation?.warnings) setValidationWarnings(body.validation.warnings);
      toast({ title: "Reconstruction started", description: `Processing ${files.length} images…` });
    } catch (err) {
      setStatus("error");
      toast({ title: "Network error", description: String(err), variant: "destructive" });
    }
  };

  const reset = () => {
    setFiles(null);
    setJobId(null);
    setStatus("idle");
    setProgress(null);
    setCurrentStep(null);
    setModelUrl(null);
    setModelBaseUrl("");
    setProjectId(null);
    setAnalysis(null);
    setValidationWarnings([]);
    setFailureMessage(null);
    setSetupCommand(null);
    setKnownLengthMeters("");
    setScaleFactor(null);
    setProjectName("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Derived UI state ───────────────────────────────────────────────────────
  const isProcessing = ["uploading", "queued", "processing"].includes(status);
  const isSucceeded = status === "succeeded";
  const isFailed = status === "failed" || status === "error";
  const stageName = getStageName(progress);

  const weight = analysis
    ? (analysis.volume * selectedCoal.density).toFixed(1)
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
          <ScanLine className="h-7 w-7 text-primary" />
          3D Reconstruction
        </h1>
        <p className="text-muted-foreground mt-1">
          Upload drone or camera photos to generate a textured 3D model and calculate volume
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* ── Left panel ── */}
        <div className="xl:col-span-1 space-y-4">
          {/* Upload card */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Image Upload</CardTitle>
              <CardDescription>Select 50–200 overlapping photos for best results</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={onSubmit} className="space-y-4">
                {/* Project name */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Project Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Coal Pile A – June 2026"
                    value={projectName}
                    onChange={(e) => setProjectName(e.target.value)}
                    disabled={isProcessing}
                    className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                  />
                </div>
                {/* Drop zone */}
                <div
                  className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-muted/50 transition-colors"
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const dropped = e.dataTransfer.files;
                    if (dropped && dropped.length > 0) setFiles(dropped);
                  }}
                >
                  <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                  {files && files.length > 0 ? (
                    <span className="text-sm font-medium">{files.length} images selected</span>
                  ) : (
                    <>
                      <span className="text-sm text-muted-foreground">Click or drag images here</span>
                      <span className="text-xs text-muted-foreground mt-1">JPG, PNG supported</span>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/jpg"
                    multiple
                    className="hidden"
                    onChange={(e) => setFiles(e.target.files)}
                  />
                </div>

                {/* Coal type */}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Coal Type</label>
                  <Select value={coalType} onValueChange={setCoalType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COAL_TYPES.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.label} ({c.density} kg/m³)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex gap-2">
                  <Button type="submit" className="flex-1" disabled={isProcessing || !files?.length}>
                    {isProcessing ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Processing…</>
                    ) : (
                      <><ScanLine className="h-4 w-4 mr-2" />Start Reconstruction</>
                    )}
                  </Button>
                  {(isSucceeded || isFailed) && (
                    <Button type="button" variant="outline" size="icon" onClick={reset} title="New reconstruction">
                      <RotateCcw className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </form>
            </CardContent>
          </Card>

          {/* Status card */}
          {status !== "idle" && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {isProcessing && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                  {isSucceeded && <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  {isFailed && <XCircle className="h-4 w-4 text-destructive" />}
                  Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Stage</span>
                  <Badge variant={isFailed ? "destructive" : isSucceeded ? "default" : "secondary"}>
                    {isSucceeded ? "Complete" : isFailed ? "Failed" : stageName}
                  </Badge>
                </div>

                {isProcessing && progress !== null && (
                  <>
                    <Progress value={progress} className="h-2" />
                    <p className="text-xs text-muted-foreground text-right">{progress}%</p>
                  </>
                )}

                {jobId && (
                  <div className="text-xs text-muted-foreground font-mono space-y-0.5 pt-1 border-t">
                    <div>Job: {jobId}</div>
                    {projectId && <div>Project: {projectId}</div>}
                  </div>
                )}

                {/* View in Projects button — shown when reconstruction succeeds */}
                {isSucceeded && projectId && (
                  <Button
                    size="sm"
                    className="w-full gap-2"
                    onClick={() => setLocation(`/project-view/${projectId}`)}
                  >
                    <FolderOpen className="h-4 w-4" />
                    View in Projects
                  </Button>
                )}

                {validationWarnings.length > 0 && (
                  <div className="rounded-md bg-yellow-500/10 border border-yellow-500/30 p-3 text-xs space-y-1">
                    <div className="flex items-center gap-1 font-medium text-yellow-600 dark:text-yellow-400">
                      <AlertTriangle className="h-3.5 w-3.5" /> Warnings
                    </div>
                    {validationWarnings.slice(0, 5).map((w, i) => (
                      <div key={i} className="text-muted-foreground pl-4">• {w}</div>
                    ))}
                    {validationWarnings.length > 5 && (
                      <div className="text-muted-foreground pl-4">…and {validationWarnings.length - 5} more</div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Scale Calibration card — shown when model is loaded but no GPS */}
          {modelUrl && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Ruler className="h-4 w-4 text-primary" />
                  Scale Calibration
                </CardTitle>
                <CardDescription className="text-xs">
                  Photos without GPS need a known real-world length to get accurate measurements.
                  Enter the actual length of the longest dimension of the pile.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2 items-end">
                  <div className="flex-1 space-y-1">
                    <label className="text-xs text-muted-foreground">Real-world length (metres)</label>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="e.g. 1.27"
                      value={knownLengthMeters}
                      onChange={(e) => setKnownLengthMeters(e.target.value)}
                      className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  <Button
                    size="sm"
                    disabled={!knownLengthMeters || !analysis || analyzing}
                    onClick={() => {
                      const realLen = parseFloat(knownLengthMeters);
                      if (!realLen || !analysis) return;
                      // Longest mesh dimension (unscaled) = max of L/W/H divided by current scaleFactor
                      const currentSf = scaleFactor ?? 1.0;
                      const meshLen = Math.max(
                        analysis.dimensions.length,
                        analysis.dimensions.width,
                        analysis.dimensions.height
                      ) / currentSf;
                      const newSf = realLen / meshLen;
                      setScaleFactor(newSf);
                      autoAnalyze(modelUrl!, newSf);
                      toast({ title: "Scale applied", description: `Scale factor: ${newSf.toFixed(4)} m/unit` });
                    }}
                  >
                    Apply
                  </Button>
                </div>
                {scaleFactor && scaleFactor !== 1.0 && (
                  <p className="text-xs text-green-500 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" />
                    Scale active: {scaleFactor.toFixed(4)} m/unit
                  </p>
                )}
                {(!scaleFactor || scaleFactor === 1.0) && (
                  <p className="text-xs text-yellow-500 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    No scale set — measurements may be incorrect without GPS images
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Metrics card */}
          {(analysis || analyzing) && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Measurements
                  {analyzing && <Loader2 className="h-3.5 w-3.5 animate-spin ml-auto" />}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {analysis ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <MetricTile icon={<Ruler className="h-3.5 w-3.5" />} label="Length" value={`${analysis.dimensions.length.toFixed(2)} m`} />
                      <MetricTile icon={<Ruler className="h-3.5 w-3.5" />} label="Width" value={`${analysis.dimensions.width.toFixed(2)} m`} />
                      <MetricTile icon={<Ruler className="h-3.5 w-3.5" />} label="Height" value={`${analysis.dimensions.height.toFixed(2)} m`} />
                      <MetricTile icon={<Box className="h-3.5 w-3.5" />} label="Volume" value={`${analysis.volume.toFixed(3)} m³`} />
                    </div>
                    <Separator />
                    <MetricTile
                      icon={<Weight className="h-3.5 w-3.5" />}
                      label={`Weight (${selectedCoal.label})`}
                      value={`${Number(weight).toLocaleString()} kg`}
                      large
                    />
                    <div className="flex gap-2 text-xs text-muted-foreground pt-1 border-t">
                      <span>{analysis.vertices?.toLocaleString()} vertices</span>
                      <span>·</span>
                      <span>{analysis.faces?.toLocaleString()} faces</span>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => autoAnalyze(modelUrl!)}
                      disabled={analyzing}
                    >
                      Recalculate with selected coal type
                    </Button>
                  </>
                ) : (
                  <div className="text-sm text-muted-foreground text-center py-4">
                    Analysing mesh…
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Download card */}
          {modelUrl && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Export Model</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <a href={modelUrl} download className="w-full">
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <Download className="h-4 w-4" /> Download OBJ
                  </Button>
                </a>
                <a href={modelUrl.replace(/\.obj$/i, ".mtl")} download className="w-full">
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <Layers className="h-4 w-4" /> Download MTL
                  </Button>
                </a>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full gap-2"
                  onClick={async () => {
                    try {
                      toast({ title: "Generating GLB…", description: "This may take a moment" });
                      const res = await fetch("/api/mesh/export-glb", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ meshUrl: modelUrl }),
                      });
                      if (!res.ok) throw new Error(await res.text());
                      const blob = await res.blob();
                      const a = document.createElement("a");
                      a.href = URL.createObjectURL(blob);
                      a.download = "model.glb";
                      a.click();
                    } catch (e) {
                      toast({ title: "GLB export failed", description: String(e), variant: "destructive" });
                    }
                  }}
                >
                  <Download className="h-4 w-4" /> Download GLB
                </Button>
              </CardContent>
            </Card>
          )}

          {/* Mesh quality card */}
          {quality && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className={`h-4 w-4 ${quality.qualityScore >= 60 ? "text-green-500" : quality.qualityScore >= 40 ? "text-yellow-500" : "text-destructive"}`} />
                  Mesh Quality
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Score</span>
                  <div className="flex items-center gap-2">
                    <Progress value={quality.qualityScore} className="w-20 h-1.5" />
                    <Badge variant={quality.qualityScore >= 60 ? "default" : "destructive"}>
                      {quality.qualityLabel}
                    </Badge>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Watertight</span>
                  <span className={quality.isWatertight ? "text-green-500" : "text-yellow-500"}>
                    {quality.isWatertight ? "Yes" : "No (volume estimated)"}
                  </span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Vertices</span>
                  <span className="font-mono">{quality.vertices?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Faces</span>
                  <span className="font-mono">{quality.faces?.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Surface area</span>
                  <span className="font-mono">{quality.surfaceArea?.toFixed(2)} m²</span>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* ── Right panel: 3D viewer ── */}
        <div className="xl:col-span-2">
          <Card className="h-full min-h-[560px]">
            <CardContent className="p-0 h-full min-h-[560px] relative rounded-lg overflow-hidden">
              {modelUrl ? (
                <Canvas
                  camera={{ position: [3, 3, 5], fov: 50 }}
                  style={{ background: "#0d0d14" }}
                  gl={{
                    antialias: true,
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 1.2,
                    outputColorSpace: THREE.SRGBColorSpace,
                  }}
                >
                  <Suspense fallback={<CanvasLoader />}>
                    {/* Bright ambient so textures aren't too dark */}
                    <ambientLight intensity={1.0} />
                    {/* Key light */}
                    <directionalLight position={[5, 10, 7]} intensity={1.5} castShadow />
                    {/* Fill light from opposite side */}
                    <directionalLight position={[-5, 3, -5]} intensity={0.6} />
                    {/* Soft bottom bounce */}
                    <directionalLight position={[0, -5, 0]} intensity={0.2} />
                    <ObjModel objUrl={modelUrl} baseUrl={modelBaseUrl} />
                    <OrbitControls enableDamping dampingFactor={0.05} />
                    <Environment preset="warehouse" />
                  </Suspense>
                </Canvas>
              ) : (
                <div className="flex flex-col items-center justify-center h-full min-h-[560px] text-center px-8">
                  {isProcessing ? (
                    <div className="space-y-4 w-full max-w-xs">
                      <ScanLine className="h-16 w-16 text-primary mx-auto animate-pulse" />
                      <p className="text-lg font-medium">{stageName}</p>
                      {progress !== null && (
                        <>
                          <Progress value={progress} className="h-2" />
                          <p className="text-sm text-muted-foreground">{progress}% complete</p>
                        </>
                      )}
                      <p className="text-xs text-muted-foreground">
                        Processing takes 15–60 minutes depending on image count
                      </p>
                    </div>
                  ) : isFailed ? (
                    <div className="space-y-4 max-w-sm text-center">
                      <XCircle className="h-16 w-16 text-destructive mx-auto" />
                      <p className="text-lg font-medium">Reconstruction Failed</p>

                      {setupCommand ? (
                        // NodeODM not running — show actionable setup steps
                        <div className="text-left space-y-3">
                          <p className="text-sm text-muted-foreground">
                            {failureMessage ?? "The 3D reconstruction engine is not running."}
                          </p>
                          <div className="rounded-md bg-muted p-3 space-y-2">
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                              <Terminal className="h-3.5 w-3.5" /> Start NodeODM with Docker
                            </p>
                            <code className="block text-xs font-mono break-all select-all bg-background rounded px-2 py-1.5">
                              {setupCommand}
                            </code>
                            <p className="text-xs text-muted-foreground">
                              Run this once — NodeODM will be ready at <span className="font-mono">localhost:3000</span>
                            </p>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">
                          {failureMessage ?? "Check your images have sufficient overlap and try again."}
                        </p>
                      )}

                      <Button variant="outline" onClick={reset} className="gap-2">
                        <RotateCcw className="h-4 w-4" /> Try Again
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3 text-muted-foreground">
                      <ScanLine className="h-16 w-16 mx-auto opacity-30" />
                      <p className="text-lg">Upload images to begin</p>
                      <p className="text-sm opacity-70">
                        Capture 100+ overlapping photos from multiple angles for best results
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ── Helper component ───────────────────────────────────────────────────────────
function MetricTile({ icon, label, value, large }: { icon: React.ReactNode; label: string; value: string; large?: boolean }) {
  return (
    <div className="bg-muted/50 rounded-md px-3 py-2 space-y-0.5">
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <div className={large ? "text-xl font-bold text-primary" : "text-sm font-semibold"}>
        {value}
      </div>
    </div>
  );
}
