import { Suspense, useState, useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Html, useProgress } from "@react-three/drei";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader";
import { getProject } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Loader2, Box, Ruler, Weight, AlertTriangle } from "lucide-react";

// ── Canvas loader spinner ─────────────────────────────────────────────────────
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

// ── Shared texture-loading helper ─────────────────────────────────────────────
// Loads OBJ with properly textured MeshStandardMaterial instead of the
// broken MeshPhongMaterial that MTLLoader produces (which goes dark/black
// due to specular + bump map issues in Three.js WebGL).
async function loadObjWithTextures(
  meshUrl: string,
  resourcePath: string
): Promise<THREE.Group> {
  const mtlUrl = meshUrl.replace(/\.obj$/i, ".mtl");

  // Fetch MTL text to parse texture filenames manually
  let mtlText = "";
  try { mtlText = await fetch(mtlUrl).then(r => r.text()); } catch {}

  // Pre-load all unique map_Kd textures via TextureLoader
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
    } catch { /* texture unavailable */ }
  }

  // Build a material-name → texture mapping from the MTL
  // Handles both "newmtl name\n...\nmap_Kd file" patterns
  const matToTex: Record<string, THREE.Texture | null> = {};
  const blocks = mtlText.split(/(?=newmtl\s)/i);
  for (const block of blocks) {
    const nameMatch = block.match(/newmtl\s+(\S+)/i);
    if (!nameMatch) continue;
    const matName = nameMatch[1];
    const kdMatch = block.match(/map_Kd\s+(\S+)/i);
    matToTex[matName] = kdMatch ? (diffuseMap[kdMatch[1].trim()] ?? null) : null;
  }

  // Use MTLLoader purely for face→material group assignment, then replace
  // every MeshPhongMaterial with MeshStandardMaterial + diffuse texture
  let hasMtl = false;
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
      hasMtl = true;
    } catch {}
  }

  const objLoader = new OBJLoader();
  if (hasMtl && mtlMats) objLoader.setMaterials(mtlMats);
  const group = await new Promise<THREE.Group>((res, rej) =>
    objLoader.load(meshUrl, res, undefined, rej)
  );

  // Replace every material with a clean PBR version
  const firstTex = Object.values(diffuseMap)[0] ?? null;
  group.traverse(child => {
    if (!(child as THREE.Mesh).isMesh) return;
    const mesh = child as THREE.Mesh;

    const upgrade = (old: THREE.Material): THREE.Material => {
      // Find the best diffuse texture for this material
      let map: THREE.Texture | null =
        matToTex[old.name] ??
        (old as THREE.MeshPhongMaterial).map ??
        firstTex;

      if (map) {
        map.colorSpace = THREE.SRGBColorSpace;
        map.needsUpdate = true;
      }

      const std = new THREE.MeshStandardMaterial({
        name: old.name,
        map,
        roughness: 0.8,
        metalness: 0.0,
        side: THREE.FrontSide,
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

// ── Model component ───────────────────────────────────────────────────────────
function ProjectModel({ meshUrl, baseUrl }: { meshUrl: string; baseUrl: string }) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setObj(null);
    setError(null);

    const resourcePath = baseUrl.endsWith("/") ? baseUrl : baseUrl + "/";

    const load = async () => {
      // ── 1. Try GLB first — textures are embedded, always works ───────
      const glbUrl = meshUrl.replace(/\.obj$/i, ".glb");
      try {
        const check = await fetch(glbUrl, { method: "HEAD" });
        if (check.ok) {
          const gltf = await new Promise<any>((res, rej) =>
            new GLTFLoader().load(glbUrl, res, undefined, rej)
          );
          gltf.scene.traverse((child: THREE.Object3D) => {
            if ((child as THREE.Mesh).isMesh) {
              const mats = Array.isArray((child as THREE.Mesh).material)
                ? (child as THREE.Mesh).material as THREE.Material[]
                : [(child as THREE.Mesh).material as THREE.Material];
              mats.forEach((m: any) => {
                ["map","emissiveMap","normalMap"].forEach(k => {
                  if (m[k]) { m[k].colorSpace = THREE.SRGBColorSpace; m[k].needsUpdate = true; }
                });
              });
            }
          });
          if (!cancelled) setObj(gltf.scene);
          return;
        }
      } catch {}

      // ── 2. OBJ + textures (via MeshStandardMaterial upgrade) ─────────
      const mtlUrl = meshUrl.replace(/\.obj$/i, ".mtl");
      try {
        const mtlCheck = await fetch(mtlUrl, { method: "HEAD" });
        if (mtlCheck.ok) {
          const loaded = await loadObjWithTextures(meshUrl, resourcePath);
          if (!cancelled) setObj(loaded);
          return;
        }
      } catch {}

      // ── 3. Plain OBJ fallback ─────────────────────────────────────────
      try {
        const loaded = await new Promise<THREE.Group>((res, rej) =>
          new OBJLoader().load(meshUrl, res, undefined, rej)
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
  }, [meshUrl, baseUrl]);

  if (error) return <Html center><p className="text-red-400 text-sm px-4">{error}</p></Html>;
  if (!obj) return <CanvasLoader />;
  return <primitive object={obj} />;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ProjectViewer() {
  const [, params] = useRoute("/project-view/:id");
  const [, setLocation] = useLocation();
  const projectId = params?.id;

  const { data: project, isLoading, error } = useQuery({
    queryKey: ["projects", projectId],
    queryFn: () => getProject(projectId!),
    enabled: !!projectId,
  });

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        No project specified
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !project) {
    return (
      <div className="flex items-center justify-center h-full gap-2 text-destructive">
        <AlertTriangle className="h-5 w-5" />
        Project not found
      </div>
    );
  }

  // Resolve mesh URL — GLB preferred (textures embedded), then OBJ
  const artifacts = project.reconstructionArtifacts as any;
  const glbUrl: string | null = artifacts?.meshGlb?.url ?? null;
  const objUrl: string | null =
    artifacts?.mesh?.url ??
    (project.meshFileName
      ? `/uploads/projects/${projectId}/reconstruction/${project.meshFileName}`
      : null);
  const meshUrl = glbUrl ?? objUrl;
  const baseUrl = meshUrl ? meshUrl.substring(0, meshUrl.lastIndexOf("/") + 1) : "";
  const hasDimensions = project.length != null && project.width != null && project.height != null;

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/projects")}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate flex items-center gap-2">
            <Box className="h-5 w-5 text-primary flex-shrink-0" />
            {project.name}
          </h1>
          <p className="text-sm text-muted-foreground">3D Model Viewer</p>
        </div>
        <Badge className="bg-chart-2/20 text-chart-2">
          {project.reconstructionStatus === "ready" ? "Reconstructed" : project.status}
        </Badge>
      </div>

      <div className="flex flex-col lg:flex-row gap-4 flex-1 min-h-0">
        {/* 3D Canvas */}
        <div className="flex-1 min-h-[500px] rounded-lg overflow-hidden border bg-[#0d0d14]">
          {meshUrl ? (
            <Canvas
              camera={{ position: [3, 3, 5], fov: 50 }}
              style={{ width: "100%", height: "100%" }}
              gl={{
                antialias: true,
                toneMapping: THREE.ACESFilmicToneMapping,
                toneMappingExposure: 1.2,
                outputColorSpace: THREE.SRGBColorSpace,
              }}
            >
              <Suspense fallback={<CanvasLoader />}>
                <ambientLight intensity={1.0} />
                <directionalLight position={[5, 10, 7]} intensity={1.5} castShadow />
                <directionalLight position={[-5, 3, -5]} intensity={0.6} />
                <directionalLight position={[0, -5, 0]} intensity={0.2} />
                <ProjectModel meshUrl={meshUrl} baseUrl={baseUrl} />
                <OrbitControls enableDamping dampingFactor={0.05} makeDefault />
                <Environment preset="warehouse" />
              </Suspense>
            </Canvas>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground gap-2">
              <AlertTriangle className="h-5 w-5" />
              No 3D model available for this project
            </div>
          )}
        </div>

        {/* Side panel */}
        <div className="lg:w-64 space-y-3 flex-shrink-0">
          {hasDimensions && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-medium flex items-center gap-1">
                  <Ruler className="h-4 w-4 text-primary" /> Dimensions
                </p>
                <div className="space-y-2 text-sm">
                  {[["Length", project.length], ["Width", project.width], ["Height", project.height]].map(
                    ([label, val]) => (
                      <div key={label as string} className="flex justify-between">
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-mono font-semibold">
                          {(val as number).toFixed(2)} m
                        </span>
                      </div>
                    )
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {(project.volume != null || project.weight != null) && (
            <Card>
              <CardContent className="p-4 space-y-3">
                <p className="text-sm font-medium flex items-center gap-1">
                  <Weight className="h-4 w-4 text-primary" /> Estimates
                </p>
                {project.volume != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Volume</span>
                    <span className="font-mono font-semibold">{project.volume.toFixed(3)} m³</span>
                  </div>
                )}
                {project.weight != null && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Weight</span>
                    <span className="font-mono font-semibold">
                      {project.weight.toLocaleString(undefined, { maximumFractionDigits: 0 })} kg
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4 space-y-1 text-xs text-muted-foreground">
              <p className="font-medium text-foreground text-sm mb-2">Controls</p>
              <p>🖱 Left-drag — rotate</p>
              <p>🖱 Right-drag — pan</p>
              <p>🖱 Scroll — zoom</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
