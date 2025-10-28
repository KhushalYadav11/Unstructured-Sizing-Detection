import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Button } from "@/components/ui/button";
import { RotateCw, ZoomIn, ZoomOut, Maximize2, Ruler, Upload } from "lucide-react";
import {
  loadObjectFromFile,
  scaleObjectToUnit,
  centerObject,
  computeModelMetrics,
  type ModelMetrics,
  type Unit,
} from "@/lib/three-utils";
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from "@/components/ui/select";

interface ThreeDViewerProps {
  modelLoaded?: boolean; // legacy flag; not required anymore
  measurementMode?: boolean;
  onMeasurementToggle?: () => void;
  onModelMetrics?: (metrics: ModelMetrics) => void;
}

export function ThreeDViewer({
  modelLoaded = false,
  measurementMode = false,
  onMeasurementToggle,
  onModelMetrics,
}: ThreeDViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isRotating, setIsRotating] = useState(false);
  const [hasModel, setHasModel] = useState(false);
  const [unit, setUnit] = useState<Unit>("meters");
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [measurementDistance, setMeasurementDistance] = useState<number | null>(null);
  const [measurementPoints, setMeasurementPoints] = useState<THREE.Vector3[]>([]);
  const [cumulativeDistance, setCumulativeDistance] = useState<number | null>(null);
  const [isChainMode, setIsChainMode] = useState(false);
  const [snapToVertex, setSnapToVertex] = useState(false);
  const [axisAlign, setAxisAlign] = useState(false);
  const measurementMarkersRef = useRef<THREE.Mesh[]>([]);
  const measurementLineRef = useRef<THREE.Line | null>(null);
  const previewLineRef = useRef<THREE.Line | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());

  const sceneRef = useRef<{
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    renderer?: THREE.WebGLRenderer;
    controls?: OrbitControls;
    modelRoot?: THREE.Object3D;
    axes?: THREE.AxesHelper;
    animationId?: number;
  }>({});

  useEffect(() => {
    if (!containerRef.current) return;

    let animationId: number;
    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let controls: OrbitControls | undefined;

    try {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0a0a);
      
      camera = new THREE.PerspectiveCamera(
        75,
        containerRef.current.clientWidth / containerRef.current.clientHeight,
        0.1,
        1000
      );
      camera.position.set(5, 5, 8);
      camera.lookAt(0, 0, 0);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setSize(
        containerRef.current.clientWidth,
        containerRef.current.clientHeight
      );
      containerRef.current.appendChild(renderer.domElement);

      const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
      scene.add(ambientLight);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
      directionalLight.position.set(5, 10, 7);
      scene.add(directionalLight);

      const gridHelper = new THREE.GridHelper(20, 20, 0x444444, 0x222222);
      scene.add(gridHelper);

      const axesHelper = new THREE.AxesHelper(5);
      axesHelper.position.set(0, 0, 0);
      scene.add(axesHelper);

      // Orbit controls
      controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.05;
      controls.screenSpacePanning = false;
      controls.minDistance = 0.5;
      controls.maxDistance = 200;
      controls.target.set(0, 0, 0);
      controls.update();

      sceneRef.current = { scene, camera, renderer, controls, axes: axesHelper };

      const animate = () => {
        if (isRotating && sceneRef.current.modelRoot) {
          sceneRef.current.modelRoot.rotation.y += 0.005;
        }
        controls?.update();
        renderer.render(scene, camera);
        animationId = requestAnimationFrame(animate);
      };
      animate();

      const handleResize = () => {
        if (!containerRef.current) return;
        camera.aspect =
          containerRef.current.clientWidth / containerRef.current.clientHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(
          containerRef.current.clientWidth,
          containerRef.current.clientHeight
        );
      };
      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        if (animationId) {
          cancelAnimationFrame(animationId);
        }
        // Properly dispose of Three.js resources
        if (renderer) {
          renderer.dispose();
          if (containerRef.current && renderer.domElement) {
            containerRef.current.removeChild(renderer.domElement);
          }
        }
        // Dispose of controls
        controls?.dispose();
        // Dispose of geometries and materials
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            object.geometry.dispose();
            if (Array.isArray(object.material)) {
              object.material.forEach(material => material.dispose());
            } else {
              (object.material as THREE.Material).dispose();
            }
          }
        });

        // Dispose measurement artifacts
        measurementMarkersRef.current.forEach(m => {
          scene.remove(m);
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        });
        measurementMarkersRef.current = [];
        if (measurementLineRef.current) {
          scene.remove(measurementLineRef.current);
          (measurementLineRef.current.geometry as THREE.BufferGeometry).dispose();
          (measurementLineRef.current.material as THREE.Material).dispose();
          measurementLineRef.current = null;
        }
        if (previewLineRef.current) {
          scene.remove(previewLineRef.current);
          (previewLineRef.current.geometry as THREE.BufferGeometry).dispose();
          (previewLineRef.current.material as THREE.Material).dispose();
          previewLineRef.current = null;
        }
      };
    } catch (error) {
      console.warn("WebGL not available:", error);
      return;
    }
  }, [modelLoaded, measurementMode, isRotating]);

  const clearCurrentModel = useCallback(() => {
    const { scene, modelRoot } = sceneRef.current;
    if (!scene || !modelRoot) return;
    scene.remove(modelRoot);
    modelRoot.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
        else (mesh.material as THREE.Material).dispose();
      }
    });
    sceneRef.current.modelRoot = undefined;
    setHasModel(false);
    setMetrics(null);

    // Clear measurement artifacts
    measurementMarkersRef.current.forEach(m => {
      scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    measurementMarkersRef.current = [];
    if (measurementLineRef.current) {
      scene.remove(measurementLineRef.current);
      (measurementLineRef.current.geometry as THREE.BufferGeometry).dispose();
      (measurementLineRef.current.material as THREE.Material).dispose();
      measurementLineRef.current = null;
    }
    setMeasurementPoints([]);
    setMeasurementDistance(null);
  }, []);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      const object = await loadObjectFromFile(file);

      // Normalize transforms
      scaleObjectToUnit(object, unit, file.name);
      centerObject(object);

      // Add to scene
      const { scene, camera, controls, axes } = sceneRef.current;
      if (!scene || !camera) return;

      clearCurrentModel();
      scene.add(object);
      sceneRef.current.modelRoot = object;
      setHasModel(true);

      // Frame the model
      const box = new THREE.Box3().setFromObject(object);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const fitDist = (maxDim / (2 * Math.tan((camera.fov * Math.PI) / 360)));
      const dir = new THREE.Vector3(1, 1, 1).normalize();
      camera.position.copy(center.clone().add(dir.multiplyScalar(fitDist * 1.5)));
      camera.near = Math.max(0.01, maxDim / 1000);
      camera.far = Math.max(1000, fitDist * 10);
      camera.updateProjectionMatrix();
      controls?.target.copy(center);
      controls?.update();

      // Ensure axes bisect the model center
      axes?.position.copy(center);

      // Compute metrics
      const computed = computeModelMetrics(object);
      setMetrics(computed);
      onModelMetrics?.(computed);
    } catch (e) {
      console.error("Failed to load model:", e);
    }
  }, [unit, clearCurrentModel, onModelMetrics]);

  // Measurement helpers
  const addMeasurementPoint = useCallback((point: THREE.Vector3) => {
    const { scene, modelRoot } = sceneRef.current;
    if (!scene || !modelRoot) return;

    // Clear preview when committing a point
    if (previewLineRef.current) {
      scene.remove(previewLineRef.current);
      (previewLineRef.current.geometry as THREE.BufferGeometry).dispose();
      (previewLineRef.current.material as THREE.Material).dispose();
      previewLineRef.current = null;
    }

    // Marker size relative to model size
    const box = new THREE.Box3().setFromObject(modelRoot);
    const maxDim = Math.max(box.getSize(new THREE.Vector3()).x, box.getSize(new THREE.Vector3()).y, box.getSize(new THREE.Vector3()).z);
    const radius = Math.max(0.005, maxDim * 0.01);

    const markerGeom = new THREE.SphereGeometry(radius, 16, 16);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });
    const marker = new THREE.Mesh(markerGeom, markerMat);
    marker.position.copy(point);
    scene.add(marker);
    measurementMarkersRef.current.push(marker);

    setMeasurementPoints((prev) => {
      let next = prev;
      if (!isChainMode && prev.length >= 2) {
        // Non-chain mode: start fresh
        next = [];
        // remove old markers
        measurementMarkersRef.current.forEach(m => {
          scene.remove(m);
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        });
        measurementMarkersRef.current = [];
      }
      const updated = [...next, point.clone()];

      // Update line and distances
      if (isChainMode) {
        // rebuild line for chain
        if (measurementLineRef.current) {
          scene.remove(measurementLineRef.current);
          (measurementLineRef.current.geometry as THREE.BufferGeometry).dispose();
          (measurementLineRef.current.material as THREE.Material).dispose();
          measurementLineRef.current = null;
        }
        if (updated.length >= 2) {
          const lineGeom = new THREE.BufferGeometry().setFromPoints(updated);
          const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff });
          const line = new THREE.Line(lineGeom, lineMat);
          measurementLineRef.current = line;
          scene.add(line);
          // update cumulative
          let sum = 0;
          for (let i = 1; i < updated.length; i++) {
            sum += updated[i - 1].distanceTo(updated[i]);
          }
          setCumulativeDistance(sum);
          setMeasurementDistance(updated[updated.length - 2].distanceTo(updated[updated.length - 1]));
        } else {
          setCumulativeDistance(null);
          setMeasurementDistance(null);
        }
      } else {
        // simple two-point measurement
        if (updated.length === 2) {
          const lineGeom = new THREE.BufferGeometry().setFromPoints(updated);
          const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff });
          const line = new THREE.Line(lineGeom, lineMat);
          if (measurementLineRef.current) {
            scene.remove(measurementLineRef.current);
            (measurementLineRef.current.geometry as THREE.BufferGeometry).dispose();
            (measurementLineRef.current.material as THREE.Material).dispose();
          }
          measurementLineRef.current = line;
          scene.add(line);
          setMeasurementDistance(updated[0].distanceTo(updated[1]));
        } else {
          setMeasurementDistance(null);
        }
      }

      return updated;
    });
  }, [isChainMode]);

  const resetMeasurement = useCallback(() => {
    const { scene } = sceneRef.current;
    if (!scene) return;
    measurementMarkersRef.current.forEach(m => {
      scene.remove(m);
      m.geometry.dispose();
      (m.material as THREE.Material).dispose();
    });
    measurementMarkersRef.current = [];
    if (measurementLineRef.current) {
      scene.remove(measurementLineRef.current);
      (measurementLineRef.current.geometry as THREE.BufferGeometry).dispose();
      (measurementLineRef.current.material as THREE.Material).dispose();
      measurementLineRef.current = null;
    }
    if (previewLineRef.current) {
      scene.remove(previewLineRef.current);
      (previewLineRef.current.geometry as THREE.BufferGeometry).dispose();
      (previewLineRef.current.material as THREE.Material).dispose();
      previewLineRef.current = null;
    }
    setMeasurementPoints([]);
    setMeasurementDistance(null);
    setCumulativeDistance(null);
  }, []);

  const handleMeasureClick = useCallback((ev: PointerEvent) => {
    // Require Shift + Left Click to add measurement points to avoid rotation conflicts
    if (!ev.shiftKey || ev.button !== 0) return;
    const { renderer, camera, modelRoot } = sceneRef.current;
    if (!renderer || !camera || !modelRoot) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    mouseRef.current.set(x, y);
    raycasterRef.current.setFromCamera(mouseRef.current, camera);

    const intersects = raycasterRef.current.intersectObject(modelRoot, true);
    if (intersects.length > 0) {
      const intersect = intersects[0];
      const start = measurementPoints.length > 0 ? measurementPoints[measurementPoints.length - 1] : undefined;
      let candidate = intersect.point.clone();

      if (snapToVertex) {
        const mesh = intersect.object as THREE.Mesh;
        const geom = mesh.geometry as THREE.BufferGeometry;
        const index = geom.getIndex();
        const posAttr = geom.getAttribute("position") as THREE.BufferAttribute;
        const faceIndex = intersect.faceIndex ?? 0;
        let ai: number, bi: number, ci: number;
        if (index) {
          const base = faceIndex * 3;
          ai = index.getX(base);
          bi = index.getX(base + 1);
          ci = index.getX(base + 2);
        } else {
          ai = intersect.face?.a ?? 0;
          bi = intersect.face?.b ?? 1;
          ci = intersect.face?.c ?? 2;
        }
        const a = new THREE.Vector3(posAttr.getX(ai), posAttr.getY(ai), posAttr.getZ(ai)).applyMatrix4(mesh.matrixWorld);
        const b = new THREE.Vector3(posAttr.getX(bi), posAttr.getY(bi), posAttr.getZ(bi)).applyMatrix4(mesh.matrixWorld);
        const c = new THREE.Vector3(posAttr.getX(ci), posAttr.getY(ci), posAttr.getZ(ci)).applyMatrix4(mesh.matrixWorld);
        const dA = candidate.distanceTo(a);
        const dB = candidate.distanceTo(b);
        const dC = candidate.distanceTo(c);
        candidate = dA <= dB && dA <= dC ? a : dB <= dC ? b : c;
      }

      if (axisAlign && start) {
        const delta = candidate.clone().sub(start);
        const ax = Math.abs(delta.x);
        const ay = Math.abs(delta.y);
        const az = Math.abs(delta.z);
        if (ax >= ay && ax >= az) candidate.set(start.x + delta.x, start.y, start.z);
        else if (ay >= ax && ay >= az) candidate.set(start.x, start.y + delta.y, start.z);
        else candidate.set(start.x, start.y, start.z + delta.z);
      }

      if (!isChainMode && measurementPoints.length >= 2) {
        resetMeasurement();
      }
      addMeasurementPoint(candidate);
    }
  }, [addMeasurementPoint, measurementPoints, resetMeasurement, snapToVertex, axisAlign, isChainMode]);

  const handleMeasureMove = useCallback((ev: PointerEvent) => {
    // Require Shift to show preview and ignore while dragging (buttons!=0)
    if (measurementPoints.length === 0 || !ev.shiftKey || ev.buttons !== 0) return;
    const { renderer, camera, modelRoot } = sceneRef.current;
    if (!renderer || !camera || !modelRoot) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
    mouseRef.current.set(x, y);
    raycasterRef.current.setFromCamera(mouseRef.current, camera);
    const intersects = raycasterRef.current.intersectObject(modelRoot, true);
    if (intersects.length > 0) {
      const intersect = intersects[0];
      const start = measurementPoints[measurementPoints.length - 1];
      let candidate = intersect.point.clone();

      if (snapToVertex) {
        const mesh = intersect.object as THREE.Mesh;
        const geom = mesh.geometry as THREE.BufferGeometry;
        const index = geom.getIndex();
        const posAttr = geom.getAttribute("position") as THREE.BufferAttribute;
        const faceIndex = intersect.faceIndex ?? 0;
        let ai: number, bi: number, ci: number;
        if (index) {
          const base = faceIndex * 3;
          ai = index.getX(base);
          bi = index.getX(base + 1);
          ci = index.getX(base + 2);
        } else {
          ai = intersect.face?.a ?? 0;
          bi = intersect.face?.b ?? 1;
          ci = intersect.face?.c ?? 2;
        }
        const a = new THREE.Vector3(posAttr.getX(ai), posAttr.getY(ai), posAttr.getZ(ai)).applyMatrix4(mesh.matrixWorld);
        const b = new THREE.Vector3(posAttr.getX(bi), posAttr.getY(bi), posAttr.getZ(bi)).applyMatrix4(mesh.matrixWorld);
        const c = new THREE.Vector3(posAttr.getX(ci), posAttr.getY(ci), posAttr.getZ(ci)).applyMatrix4(mesh.matrixWorld);
        const dA = candidate.distanceTo(a);
        const dB = candidate.distanceTo(b);
        const dC = candidate.distanceTo(c);
        candidate = dA <= dB && dA <= dC ? a : dB <= dC ? b : c;
      }

      if (axisAlign) {
        const delta = candidate.clone().sub(start);
        const ax = Math.abs(delta.x);
        const ay = Math.abs(delta.y);
        const az = Math.abs(delta.z);
        if (ax >= ay && ax >= az) candidate.set(start.x + delta.x, start.y, start.z);
        else if (ay >= ax && ay >= az) candidate.set(start.x, start.y + delta.y, start.z);
        else candidate.set(start.x, start.y, start.z + delta.z);
      }

      const { scene, modelRoot: mr } = sceneRef.current;
      if (!scene || !mr) return;
      if (previewLineRef.current) {
        scene.remove(previewLineRef.current);
        (previewLineRef.current.geometry as THREE.BufferGeometry).dispose();
        (previewLineRef.current.material as THREE.Material).dispose();
        previewLineRef.current = null;
      }
      // Scale dash size relative to model size so it remains visible across units
      const bbox = new THREE.Box3().setFromObject(mr);
      const maxDim = bbox.getSize(new THREE.Vector3());
      const dash = Math.max(0.005, Math.max(maxDim.x, maxDim.y, maxDim.z) * 0.01);
      const geom = new THREE.BufferGeometry().setFromPoints([start.clone(), candidate.clone()]);
      const mat = new THREE.LineDashedMaterial({ color: 0x66ccff, dashSize: dash, gapSize: dash * 0.5 });
      const line = new THREE.Line(geom, mat);
      line.computeLineDistances();
      previewLineRef.current = line;
      scene.add(line);
      setMeasurementDistance(start.distanceTo(candidate));
    }
  }, [measurementPoints, snapToVertex, axisAlign]);

  useEffect(() => {
    const { renderer, controls } = sceneRef.current;
    if (!renderer || !controls) return;
    if (measurementMode) {
      renderer.domElement.addEventListener("pointerdown", handlePointerDown);
      renderer.domElement.addEventListener("pointerup", handlePointerUp);
      renderer.domElement.addEventListener("pointermove", handleMeasureMove);
      return () => {
        renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
        renderer.domElement.removeEventListener("pointerup", handlePointerUp);
        renderer.domElement.removeEventListener("pointermove", handleMeasureMove);
      };
    }
  }, [measurementMode, handlePointerDown, handlePointerUp, handleMeasureMove]);

  // Display unit conversion factors and labels
  const metersPerUnit = unit === "meters" ? 1 : unit === "centimeters" ? 0.01 : 0.001;
  const unitLabel = unit === "meters" ? "m" : unit === "centimeters" ? "cm" : "mm";
  const volumeUnitLabel = unit === "meters" ? "m³" : unit === "centimeters" ? "cm³" : "mm³";

  const lengthDisplay = metrics ? metrics.dimensions.length / metersPerUnit : 0;
  const widthDisplay = metrics ? metrics.dimensions.width / metersPerUnit : 0;
  const heightDisplay = metrics ? metrics.dimensions.height / metersPerUnit : 0;
  const volumeDisplay = metrics ? metrics.volume / (metersPerUnit * metersPerUnit * metersPerUnit) : 0;

  const measurementDisplay = measurementDistance !== null ? (measurementDistance / metersPerUnit) : null;
  const cumulativeDisplay = cumulativeDistance !== null ? (cumulativeDistance / metersPerUnit) : null;

  return (
    <div className="relative h-full w-full bg-gray-950 rounded-md overflow-hidden">
      <div ref={containerRef} className="w-full h-full" />
      
      {!hasModel && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="text-muted-foreground text-lg mb-2">
              No 3D Model Loaded
            </div>
            <div className="text-muted-foreground/60 text-sm">
              Upload a .obj/.stl/.gltf/.glb file to begin
            </div>
          </div>
        </div>
      )}
      
      <div className="absolute top-4 right-4 flex flex-col gap-2">
        <Button
          variant="secondary"
          size="icon"
          onClick={() => setIsRotating(!isRotating)}
          data-testid="button-rotation-toggle"
        >
          <RotateCw className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          data-testid="button-zoom-in"
          onClick={() => {
            const { camera, controls } = sceneRef.current;
            if (!camera || !controls) return;
            const dir = new THREE.Vector3();
            camera.getWorldDirection(dir);
            const step = 0.1 * camera.position.distanceTo(controls.target);
            camera.position.add(dir.multiplyScalar(-step));
            controls.update();
          }}
        >
          <ZoomIn className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          data-testid="button-zoom-out"
          onClick={() => {
            const { camera, controls } = sceneRef.current;
            if (!camera || !controls) return;
            const dir = new THREE.Vector3();
            camera.getWorldDirection(dir);
            const step = 0.1 * camera.position.distanceTo(controls.target);
            camera.position.add(dir.multiplyScalar(step));
            controls.update();
          }}
        >
          <ZoomOut className="h-4 w-4" />
        </Button>
        <Button
          variant="secondary"
          size="icon"
          data-testid="button-fullscreen"
          onClick={() => containerRef.current?.requestFullscreen().catch(() => {})}
        >
          <Maximize2 className="h-4 w-4" />
        </Button>
      </div>
      
      <div className="absolute bottom-4 right-4">
        <Button
          variant={measurementMode ? "default" : "secondary"}
          onClick={onMeasurementToggle}
          data-testid="button-measurement-mode"
        >
          <Ruler className="h-4 w-4 mr-2" />
          {measurementMode ? "Exit Measurement" : "Measurement Mode"}
        </Button>
      </div>
      
      {/* Unit selector and uploader */}
      <div className="absolute top-4 left-4 flex items-center gap-2">
        <Select value={unit} onValueChange={(v) => setUnit(v as Unit)}>
          <SelectTrigger className="w-28 bg-background/80 backdrop-blur" data-testid="select-model-unit">
            <SelectValue placeholder="Unit" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="meters">meters</SelectItem>
            <SelectItem value="centimeters">centimeters</SelectItem>
            <SelectItem value="millimeters">millimeters</SelectItem>
          </SelectContent>
        </Select>
        <label className="inline-flex items-center gap-2 px-3 py-2 rounded-md bg-background/80 backdrop-blur cursor-pointer border hover:bg-background/90">
          <Upload className="h-4 w-4" />
          <span className="text-sm">Upload Model</span>
          <input
            type="file"
            accept=".obj,.stl,.gltf,.glb"
            onChange={(e) => handleFiles(e.target.files)}
            className="hidden"
            data-testid="input-upload-model"
          />
        </label>
        {hasModel && (
          <Button variant="ghost" size="sm" onClick={clearCurrentModel} className="text-xs">
            Clear
          </Button>
        )}
      </div>
      
      {metrics && (
        <div className="absolute bottom-4 left-4 text-xs font-mono text-muted-foreground bg-card/80 backdrop-blur px-3 py-2 rounded space-y-0.5">
          <div>Length: {lengthDisplay.toFixed(2)} {unitLabel}</div>
          <div>Width: {widthDisplay.toFixed(2)} {unitLabel}</div>
          <div>Height: {heightDisplay.toFixed(2)} {unitLabel}</div>
          <div>Volume: {volumeDisplay.toFixed(2)} {volumeUnitLabel}</div>
          <div>Triangles: {metrics.triangles}</div>
        </div>
      )}
      
      {measurementMode && (
        <div className="absolute bottom-24 left-4 text-xs font-mono text-muted-foreground bg-primary/10 border border-primary/20 backdrop-blur px-3 py-2 rounded space-y-1">
          <div className="font-semibold">Measurement Mode</div>
          <div className="flex gap-2 py-1">
            <Button variant={isChainMode ? "default" : "secondary"} size="sm" className="text-xs" onClick={() => setIsChainMode(v => !v)}>
              Chain
            </Button>
            <Button variant={axisAlign ? "default" : "secondary"} size="sm" className="text-xs" onClick={() => setAxisAlign(v => !v)}>
              Axis Align
            </Button>
            <Button variant={snapToVertex ? "default" : "secondary"} size="sm" className="text-xs" onClick={() => setSnapToVertex(v => !v)}>
              Snap Vertex
            </Button>
            <Button variant="ghost" size="sm" className="text-xs" onClick={() => {
              const { scene } = sceneRef.current;
              if (!scene || measurementMarkersRef.current.length === 0) return;
              const last = measurementMarkersRef.current.pop();
              if (last) {
                scene.remove(last);
                last.geometry.dispose();
                (last.material as THREE.Material).dispose();
              }
              setMeasurementPoints((prev) => prev.slice(0, -1));
            }} disabled={measurementPoints.length === 0}>
              Undo
            </Button>
          </div>
          <div>Click (no drag) to measure; hold Shift to preview.</div>
          {measurementDisplay !== null ? (
            <div>
              Last segment: <span className="font-bold">{measurementDisplay.toFixed(3)} {unitLabel}</span>
            </div>
          ) : (
            <div>Last segment: --</div>
          )}
          {cumulativeDisplay !== null && (
            <div>
              Total: <span className="font-bold">{cumulativeDisplay.toFixed(3)} {unitLabel}</span>
            </div>
          )}
          <div className="pt-1 flex gap-2">
            <Button variant="ghost" size="sm" onClick={resetMeasurement} className="text-xs">Reset</Button>
          </div>
        </div>
      )}
    </div>
);
}

// Add drag detection refs
const downPosRef = useRef<{ x: number; y: number } | null>(null);
const isDraggingRef = useRef(false);

// New: record pointer down for click-vs-drag detection
const handlePointerDown = useCallback((ev: PointerEvent) => {
  if (ev.button !== 0) return;
  isDraggingRef.current = false;
  downPosRef.current = { x: ev.clientX, y: ev.clientY };
}, []);

// Update: preview move also updates drag detection threshold
const handleMeasureMove = useCallback((ev: PointerEvent) => {
  // Mark as dragging if movement exceeds threshold after a pointerdown
  if (downPosRef.current) {
    const dx = Math.abs(ev.clientX - downPosRef.current.x);
    const dy = Math.abs(ev.clientY - downPosRef.current.y);
    if (dx > 5 || dy > 5) isDraggingRef.current = true;
  }
  // Require Shift to show preview and ignore while dragging (buttons!=0)
  if (measurementPoints.length === 0 || !ev.shiftKey || ev.buttons !== 0) return;
  const { renderer, camera, modelRoot } = sceneRef.current;
  if (!renderer || !camera || !modelRoot) return;

  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
  mouseRef.current.set(x, y);
  raycasterRef.current.setFromCamera(mouseRef.current, camera);
  const intersects = raycasterRef.current.intersectObject(modelRoot, true);
  if (intersects.length > 0) {
    const intersect = intersects[0];
    const start = measurementPoints[measurementPoints.length - 1];
    let candidate = intersect.point.clone();

    if (snapToVertex) {
      const mesh = intersect.object as THREE.Mesh;
      const geom = mesh.geometry as THREE.BufferGeometry;
      const index = geom.getIndex();
      const posAttr = geom.getAttribute("position") as THREE.BufferAttribute;
      const faceIndex = intersect.faceIndex ?? 0;
      let ai: number, bi: number, ci: number;
      if (index) {
        const base = faceIndex * 3;
        ai = index.getX(base);
        bi = index.getX(base + 1);
        ci = index.getX(base + 2);
      } else {
        ai = intersect.face?.a ?? 0;
        bi = intersect.face?.b ?? 1;
        ci = intersect.face?.c ?? 2;
      }
      const a = new THREE.Vector3(posAttr.getX(ai), posAttr.getY(ai), posAttr.getZ(ai)).applyMatrix4(mesh.matrixWorld);
      const b = new THREE.Vector3(posAttr.getX(bi), posAttr.getY(bi), posAttr.getZ(bi)).applyMatrix4(mesh.matrixWorld);
      const c = new THREE.Vector3(posAttr.getX(ci), posAttr.getY(ci), posAttr.getZ(ci)).applyMatrix4(mesh.matrixWorld);
      const dA = candidate.distanceTo(a);
      const dB = candidate.distanceTo(b);
      const dC = candidate.distanceTo(c);
      candidate = dA <= dB && dA <= dC ? a : dB <= dC ? b : c;
    }

    if (axisAlign) {
      const delta = candidate.clone().sub(start);
      const ax = Math.abs(delta.x);
      const ay = Math.abs(delta.y);
      const az = Math.abs(delta.z);
      if (ax >= ay && ax >= az) candidate.set(start.x + delta.x, start.y, start.z);
      else if (ay >= ax && ay >= az) candidate.set(start.x, start.y + delta.y, start.z);
      else candidate.set(start.x, start.y, start.z + delta.z);
    }

    const { scene, modelRoot: mr } = sceneRef.current;
    if (!scene || !mr) return;
    if (previewLineRef.current) {
      scene.remove(previewLineRef.current);
      (previewLineRef.current.geometry as THREE.BufferGeometry).dispose();
      (previewLineRef.current.material as THREE.Material).dispose();
      previewLineRef.current = null;
    }
    // Scale dash size relative to model size so it remains visible across units
    const bbox = new THREE.Box3().setFromObject(mr);
    const maxDim = bbox.getSize(new THREE.Vector3());
    const dash = Math.max(0.005, Math.max(maxDim.x, maxDim.y, maxDim.z) * 0.01);
    const geom = new THREE.BufferGeometry().setFromPoints([start.clone(), candidate.clone()]);
    const mat = new THREE.LineDashedMaterial({ color: 0x66ccff, dashSize: dash, gapSize: dash * 0.5 });
    const line = new THREE.Line(geom, mat);
    line.computeLineDistances();
    previewLineRef.current = line;
    scene.add(line);
    setMeasurementDistance(start.distanceTo(candidate));
  }
}, [measurementPoints, snapToVertex, axisAlign]);

// New: place points on click when not dragging
const handlePointerUp = useCallback((ev: PointerEvent) => {
  if (ev.button !== 0) return;
  const dp = downPosRef.current;
  const moved = dp ? Math.hypot(ev.clientX - dp.x, ev.clientY - dp.y) > 5 : false;
  const wasDragging = isDraggingRef.current || moved;
  downPosRef.current = null;
  isDraggingRef.current = false;
  if (wasDragging) return; // treat as rotation/pan; do not place point

  const { renderer, camera, modelRoot } = sceneRef.current;
  if (!renderer || !camera || !modelRoot) return;

  const rect = renderer.domElement.getBoundingClientRect();
  const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
  const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
  mouseRef.current.set(x, y);
  raycasterRef.current.setFromCamera(mouseRef.current, camera);

  const intersects = raycasterRef.current.intersectObject(modelRoot, true);
  if (intersects.length > 0) {
    const intersect = intersects[0];
    const start = measurementPoints.length > 0 ? measurementPoints[measurementPoints.length - 1] : undefined;
    let candidate = intersect.point.clone();

    if (snapToVertex) {
      const mesh = intersect.object as THREE.Mesh;
      const geom = mesh.geometry as THREE.BufferGeometry;
      const index = geom.getIndex();
      const posAttr = geom.getAttribute("position") as THREE.BufferAttribute;
      const faceIndex = intersect.faceIndex ?? 0;
      let ai: number, bi: number, ci: number;
      if (index) {
        const base = faceIndex * 3;
        ai = index.getX(base);
        bi = index.getX(base + 1);
        ci = index.getX(base + 2);
      } else {
        ai = intersect.face?.a ?? 0;
        bi = intersect.face?.b ?? 1;
        ci = intersect.face?.c ?? 2;
      }
      const a = new THREE.Vector3(posAttr.getX(ai), posAttr.getY(ai), posAttr.getZ(ai)).applyMatrix4(mesh.matrixWorld);
      const b = new THREE.Vector3(posAttr.getX(bi), posAttr.getY(bi), posAttr.getZ(bi)).applyMatrix4(mesh.matrixWorld);
      const c = new THREE.Vector3(posAttr.getX(ci), posAttr.getY(ci), posAttr.getZ(ci)).applyMatrix4(mesh.matrixWorld);
      const dA = candidate.distanceTo(a);
      const dB = candidate.distanceTo(b);
      const dC = candidate.distanceTo(c);
      candidate = dA <= dB && dA <= dC ? a : dB <= dC ? b : c;
    }

    if (axisAlign && start) {
      const delta = candidate.clone().sub(start);
      const ax = Math.abs(delta.x);
      const ay = Math.abs(delta.y);
      const az = Math.abs(delta.z);
      if (ax >= ay && ax >= az) candidate.set(start.x + delta.x, start.y, start.z);
      else if (ay >= ax && ay >= az) candidate.set(start.x, start.y + delta.y, start.z);
      else candidate.set(start.x, start.y, start.z + delta.z);
    }

    if (!isChainMode && measurementPoints.length >= 2) {
      resetMeasurement();
    }
    addMeasurementPoint(candidate);
  }
}, [addMeasurementPoint, measurementPoints, resetMeasurement, snapToVertex, axisAlign, isChainMode]);
useEffect(() => {
  const { renderer, controls } = sceneRef.current;
  if (!renderer || !controls) return;
  if (measurementMode) {
    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointerup", handlePointerUp);
    renderer.domElement.addEventListener("pointermove", handleMeasureMove);
    return () => {
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointerup", handlePointerUp);
      renderer.domElement.removeEventListener("pointermove", handleMeasureMove);
    };
  }
}, [measurementMode, handlePointerDown, handlePointerUp, handleMeasureMove]);

// Update overlay instructions
// <div>Hold Shift and click to measure; hover with Shift shows preview.</div>
// becomes:
// <div>Click (no drag) to measure; hold Shift to preview.</div>
