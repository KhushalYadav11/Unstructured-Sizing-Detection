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
  const [isRotating, setIsRotating] = useState(true);
  const [hasModel, setHasModel] = useState(false);
  const [unit, setUnit] = useState<Unit>("meters");
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const sceneRef = useRef<{
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    renderer?: THREE.WebGLRenderer;
    controls?: OrbitControls;
    modelRoot?: THREE.Object3D;
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

    sceneRef.current = { scene, camera, renderer, controls };

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
            object.material.dispose();
          }
        }
      });
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
        else mesh.material.dispose();
      }
    });
    sceneRef.current.modelRoot = undefined;
    setHasModel(false);
    setMetrics(null);
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
      const { scene, camera, controls } = sceneRef.current;
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

      // Compute metrics
      const computed = computeModelMetrics(object);
      setMetrics(computed);
      onModelMetrics?.(computed);
    } catch (e) {
      console.error("Failed to load model:", e);
    }
  }, [unit, clearCurrentModel, onModelMetrics]);

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
          Measurement Mode
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
          <div>Length: {metrics.dimensions.length.toFixed(2)} m</div>
          <div>Width: {metrics.dimensions.width.toFixed(2)} m</div>
          <div>Height: {metrics.dimensions.height.toFixed(2)} m</div>
          <div>Volume: {metrics.volume.toFixed(2)} m³</div>
          <div>Triangles: {metrics.triangles}</div>
        </div>
      )}
    </div>
  );
}
