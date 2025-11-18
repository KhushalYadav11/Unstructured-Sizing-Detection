import React, { useState, useEffect, useRef } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Html, useProgress } from "@react-three/drei";
import * as THREE from "three";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader";
import { FBXLoader } from "three/examples/jsm/loaders/FBXLoader";
import { processMeshByUrl } from "@/lib/mesh-api";

function Loader() {
  const { progress } = useProgress();
  return <Html center>{Math.round(progress)}%</Html>;
}

export default function Reconstruction() {
  const [files, setFiles] = useState<FileList | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("idle");
  const [modelUrl, setModelUrl] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<any | null>(null);
  const [analyzing, setAnalyzing] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/reconstruct/${jobId}`);
        if (!res.ok) return;
        const data = await res.json();
        const job = data.job;
        if (!job) return;
        setStatus(job.status || "unknown");
        if (job.status === "succeeded") {
          // Prefer artifact URL if provided
          const meshUrl = job.artifacts?.mesh?.url;
          if (meshUrl) {
            setModelUrl(meshUrl);
          } else {
            // try common fallback locations based on projectId
            const pid = job.projectId;
            if (pid) {
              const tryUrls = [
                `/uploads/projects/${pid}/reconstruction/mesh.obj`,
                `/uploads/projects/${pid}/reconstruction/model.obj`,
                `/uploads/projects/${pid}/reconstruction/model.fbx`,
              ];
              for (const u of tryUrls) {
                // HEAD to check existence
                try {
                  const r = await fetch(u, { method: "HEAD" });
                  if (r.ok) {
                    setModelUrl(u);
                    break;
                  }
                } catch {}
              }
            }
          }
          return;
        } else if (job.status === "failed") {
          // stop polling
          return;
        }
      } catch {
        // ignore
      } finally {
        if (!cancelled) setTimeout(poll, 2500);
      }
    };
    poll();
    return () => { cancelled = true; };
  }, [jobId]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!files || files.length === 0) return alert("Select images");
    const form = new FormData();
    const pid = `project_${Date.now()}`;
    form.append("projectId", pid);
    for (let i = 0; i < files.length; i++) form.append("images", files[i]);

    setStatus("uploading");
    const res = await fetch("/api/reconstruct", { method: "POST", body: form });
    if (!res.ok) {
      setStatus("error");
      return;
    }
    const body = await res.json();
    setJobId(body.jobId || null);
    setProjectId(body.projectId || pid);
    setStatus("queued");
  };

  const onAnalyze = async () => {
    if (!modelUrl) return;
    try {
      setAnalyzing(true);
      const res = await processMeshByUrl(modelUrl);
      setAnalysis(res);
    } catch (err) {
      alert((err as Error).message || "Failed to analyze mesh");
    } finally {
      setAnalyzing(false);
    }
  };

  return (
    <div style={{ display: "flex", gap: 16 }}>
      <form onSubmit={onSubmit} style={{ width: 320 }}>
        <h3>3D Reconstruction</h3>
        <input
          type="file"
          accept="image/*"
          multiple
          // Allow folder selection in supporting browsers
          // @ts-expect-error non-standard attribute
          webkitdirectory
          // @ts-expect-error non-standard attribute
          directory
          onChange={(e) => setFiles(e.target.files)}
        />
        <div style={{ marginTop: 12 }}>
          <button type="submit">Start Reconstruction</button>
        </div>
        <div style={{ marginTop: 12 }}>
          <div>Status: {status}</div>
          <div>Job: {jobId || "-"}</div>
          <div>Project: {projectId || "-"}</div>
        </div>
      </form>

      <div style={{ flex: 1, height: 600, border: "1px solid #ddd" }}>
        {modelUrl ? (
          <Canvas camera={{ position: [0, 1.5, 3], fov: 50 }}>
            <ambientLight />
            <directionalLight position={[5, 10, 7]} />
            <ModelLoader url={modelUrl} />
            <OrbitControls />
          </Canvas>
        ) : (
          <div style={{ padding: 20 }}>{status === "idle" ? "Upload images to begin." : `Waiting: ${status}`}</div>
        )}
        {modelUrl && (
          <div style={{ display: "flex", gap: 8, padding: 12, borderTop: "1px solid #eee" }}>
            <a href={modelUrl} download style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 6 }}>Download Model</a>
            <button onClick={onAnalyze} disabled={analyzing} style={{ padding: "8px 12px", border: "1px solid #ccc", borderRadius: 6 }}>
              {analyzing ? "Analyzing..." : "Analyze Dimensions & Weight"}
            </button>
          </div>
        )}
        {analysis && (
          <div style={{ padding: 12, fontSize: 14 }}>
            <div><strong>Volume:</strong> {analysis.volume.toFixed(3)} m³</div>
            <div><strong>Weight:</strong> {analysis.weight.toFixed(1)} kg</div>
            <div><strong>Dimensions:</strong> L {analysis.dimensions.length.toFixed(2)} m × W {analysis.dimensions.width.toFixed(2)} m × H {analysis.dimensions.height.toFixed(2)} m</div>
          </div>
        )}
      </div>
    </div>
  );
}

function ModelLoader({ url }: { url: string }) {
  const ref = useRef<THREE.Group | null>(null);
  useEffect(() => {
    let mounted = true;
    if (!url) return;
    const ext = url.split(".").pop()?.toLowerCase();
    // clear previous
    if (ref.current) {
      ref.current.clear?.();
    }
    if (ext === "obj") {
      const loader = new OBJLoader();
      loader.load(
        url,
        (obj: THREE.Group) => { if (mounted && ref.current) ref.current.add(obj); },
        undefined,
        () => { /* handle error silently */ }
      );
    } else if (ext === "fbx") {
      const loader = new FBXLoader();
      loader.load(
        url,
        (obj: THREE.Group) => { if (mounted && ref.current) ref.current.add(obj); },
        undefined,
        () => { /* handle error silently */ }
      );
    }
    return () => { mounted = false; };
  }, [url]);

  return (
    <group ref={ref as any}>
      <Loader />
    </group>
  );
}
