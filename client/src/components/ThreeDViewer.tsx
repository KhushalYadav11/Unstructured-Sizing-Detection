import { useEffect, useRef, useState, useCallback } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { LOD } from "three";
import { SimplifyModifier } from "three/examples/jsm/modifiers/SimplifyModifier.js";
import { Button } from "@/components/ui/button";
import { RotateCw, ZoomIn, ZoomOut, Maximize2, Ruler, Upload, Download, Camera, ArrowUp, ArrowRight, ArrowLeft } from "lucide-react";
import { MeasurementGrid } from "./MeasurementGrid";
import { MeasurementReport } from "./MeasurementReport";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { ConvexHull } from "three/examples/jsm/math/ConvexHull.js";
import { useViewerStore } from "@/hooks/use-viewer-store";

// Drag threshold in pixels to differentiate click vs drag
const DRAG_THRESHOLD = 5;

interface ThreeDViewerProps {
  modelLoaded?: boolean; // legacy flag; not required anymore
  measurementMode?: boolean;
  onMeasurementToggle?: () => void;
  onModelMetrics?: (metrics: ModelMetrics) => void;
}

interface ConvexHullFace {
  a: number;
  b: number;
  c: number;
}

interface MeasurementPoint extends THREE.Vector3 {
  annotation?: string;
}

export function ThreeDViewer({
  modelLoaded = false,
  measurementMode = false,
  onMeasurementToggle,
  onModelMetrics,
}: ThreeDViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const {
    measurementPoints,
    setCalculatedVolume,
    setMeasurementPoints,
    addMeasurementPoint,
  } = useViewerStore();
  const [isRotating, setIsRotating] = useState(false);
  const [hasModel, setHasModel] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [unit, setUnit] = useState<Unit>("meters");
  const [metrics, setMetrics] = useState<ModelMetrics | null>(null);
  const [measurementDistance, setMeasurementDistance] = useState<number | null>(null);

  const [cumulativeDistance, setCumulativeDistance] = useState<number | null>(null);
  const [isChainMode, setIsChainMode] = useState(false);
  const [snapToVertex, setSnapToVertex] = useState(false);
  const [axisAlign, setAxisAlign] = useState(false);
  const [showAnnotations, setShowAnnotations] = useState(true);
  const [editingAnnotation, setEditingAnnotation] = useState<number | null>(null);
  const [annotations, setAnnotations] = useState<string[]>([]);
  const [gridSize, setGridSize] = useState<number>(20);
  const [gridDivisions, setGridDivisions] = useState<number>(20);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const measurementMarkersRef = useRef<THREE.Mesh[]>([]);
  const measurementLineRef = useRef<THREE.Line | null>(null);
  const previewLineRef = useRef<THREE.Line | null>(null);
  const raycasterRef = useRef(new THREE.Raycaster());
  const mouseRef = useRef(new THREE.Vector2());
  const redoStackRef = useRef<THREE.Vector3[]>([]);

  const sceneRef = useRef<{
    scene?: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    renderer?: THREE.WebGLRenderer;
    controls?: OrbitControls;
    modelRoot?: THREE.Object3D;
    axes?: THREE.AxesHelper;
    animationId?: number;
  }>({});

  // Update grid helper
  const updateGrid = useCallback(() => {
    const { scene } = sceneRef.current;
    if (!scene) return;
    
    // Remove existing grid if any
    scene.children.forEach(child => {
      if (child instanceof THREE.GridHelper) {
        scene.remove(child);
        if (child.material instanceof THREE.Material) {
          child.material.dispose();
        }
        if (Array.isArray(child.material)) {
          child.material.forEach(m => m.dispose());
        }
      }
    });
    
    // Add new grid if enabled
    if (showGrid) {
      const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x444444, 0x222222);
      scene.add(gridHelper);
    }
  }, [showGrid, gridSize, gridDivisions]);

  // Fix convex hull calculation
  const calculateVolume = useCallback((points: THREE.Vector3[]) => {
    if (points.length < 4) return 0;

    const convexHull = new ConvexHull().setFromPoints(points);
    let volume = 0;

    // Cast faces to our interface
    const faces = (convexHull.faces || []) as unknown as ConvexHullFace[];
    
    for (const face of faces) {
      const p1 = points[face.a];
      const p2 = points[face.b];
      const p3 = points[face.c];
      volume += p1.clone().cross(p2).dot(p3) / 6;
    }

    return Math.abs(volume);
  }, []);

  useEffect(() => {
    if (measurementPoints.length > 3) {
      const volume = calculateVolume(measurementPoints);
      setCalculatedVolume(volume);
    }
  }, [measurementPoints, calculateVolume, setCalculatedVolume]);

  useEffect(() => {
    updateGrid();
  }, [showGrid, gridSize, gridDivisions, updateGrid]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Ensure container has dimensions
    const container = containerRef.current;
    if (container.clientWidth === 0 || container.clientHeight === 0) {
      // Wait for next frame to ensure container is sized
      const timeoutId = setTimeout(() => {
        if (container.clientWidth > 0 && container.clientHeight > 0) {
          // Retry initialization
          const event = new Event('resize');
          window.dispatchEvent(event);
        }
      }, 100);
      return () => clearTimeout(timeoutId);
    }

    let animationId: number;
    let renderer: THREE.WebGLRenderer;
    let scene: THREE.Scene;
    let camera: THREE.PerspectiveCamera;
    let controls: OrbitControls | undefined;

    try {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x0a0a0a);
      
      const width = container.clientWidth || 800;
      const height = container.clientHeight || 600;
      
      camera = new THREE.PerspectiveCamera(
        75,
        width / height,
        0.1,
        1000
      );
      camera.position.set(5, 5, 8);
      camera.lookAt(0, 0, 0);

      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
      renderer.setSize(width, height);
      container.appendChild(renderer.domElement);

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
      (sceneRef.current as any).isRotating = isRotating;

      const animate = () => {
        // Access isRotating from sceneRef which is updated by useEffect
        const shouldRotate = (sceneRef.current as any)?.isRotating ?? false;
        if (shouldRotate && sceneRef.current.modelRoot) {
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
          // Force WebGL context loss to prevent GPU memory leaks
          if (typeof (renderer as any).forceContextLoss === 'function') {
            (renderer as any).forceContextLoss();
          }
          renderer.dispose();
          if (containerRef.current && renderer.domElement) {
            containerRef.current.removeChild(renderer.domElement);
          }
        }
        // Dispose of controls
        controls?.dispose();
        // Dispose of textures on materials to prevent GPU leaks
        scene.traverse((object) => {
          if (object instanceof THREE.Mesh) {
            const disposeMaps = (material: THREE.Material) => {
              const m = material as any;
              const maps = [
                "map",
                "normalMap",
                "roughnessMap",
                "metalnessMap",
                "aoMap",
                "emissiveMap",
                "displacementMap",
                "alphaMap",
                "envMap",
                "specularMap",
                "lightMap",
              ];
              maps.forEach((key) => {
                const tex = m?.[key];
                if (tex && tex.isTexture) {
                  tex.dispose();
                }
              });
            };
            if (Array.isArray(object.material)) {
              object.material.forEach((material) => disposeMaps(material));
            } else {
              disposeMaps(object.material as THREE.Material);
            }
          }
        });
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
      console.error("Failed to initialize Three.js scene:", error);
      // Show error message to user
      if (containerRef.current) {
        containerRef.current.innerHTML = `
          <div style="display: flex; align-items: center; justify-content: center; height: 100%; color: #ef4444; text-align: center; padding: 20px;">
            <div>
              <h3 style="margin-bottom: 10px;">Failed to initialize 3D Viewer</h3>
              <p style="color: #9ca3af;">${error instanceof Error ? error.message : 'WebGL may not be available'}</p>
            </div>
          </div>
        `;
      }
      return;
    }
  }, []); // Only run once on mount

  // Update rotation state in the scene ref for animation loop
  useEffect(() => {
    if (sceneRef.current) {
      (sceneRef.current as any).isRotating = isRotating;
    }
  }, [isRotating]);

  const clearCurrentModel = useCallback(() => {
    const { scene, modelRoot } = sceneRef.current;
    if (!scene || !modelRoot) return;
    scene.remove(modelRoot);
    modelRoot.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh) {
        // dispose textures first
        const disposeMaps = (material: THREE.Material) => {
          const m = material as any;
          const maps = [
            "map",
            "normalMap",
            "roughnessMap",
            "metalnessMap",
            "aoMap",
            "emissiveMap",
            "displacementMap",
            "alphaMap",
            "envMap",
            "specularMap",
            "lightMap",
          ];
          maps.forEach((key) => {
            const tex = m?.[key];
            if (tex && tex.isTexture) {
              tex.dispose();
            }
          });
        };
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => disposeMaps(m));
        else disposeMaps(mesh.material as THREE.Material);
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
    redoStackRef.current = [];
  }, []);

  // Helper function to count triangles in a geometry
  const getTriangleCount = useCallback((geometry: THREE.BufferGeometry) => {
    const index = geometry.index;
    if (index) {
      return index.count / 3;
    } else {
      return geometry.attributes.position.count / 3;
    }
  }, []);

  // Create simplified version of a model using SimplifyModifier
  const createSimplifiedModel = useCallback((originalModel: THREE.Object3D, targetRatio: number) => {
    const simplifiedModel = originalModel.clone();
    const modifier = new SimplifyModifier();
    
    simplifiedModel.traverse((object) => {
      if (object instanceof THREE.Mesh && object.geometry instanceof THREE.BufferGeometry) {
        const geometry = object.geometry;
        
        // Only simplify if we have enough vertices
        if (geometry.attributes.position && geometry.attributes.position.count > 100) {
          try {
            // Calculate target vertex count
            const targetCount = Math.max(
              100, 
              Math.floor(geometry.attributes.position.count * targetRatio)
            );
            
            // Apply simplification
            const simplified = modifier.modify(geometry, targetCount);
            object.geometry = simplified;
          } catch (e) {
            console.warn("Failed to simplify geometry:", e);
          }
        }
      }
    });
    
    return simplifiedModel;
  }, []);

  // Create LOD (Level of Detail) for complex models
  const createLODModel = useCallback((originalModel: THREE.Object3D) => {
    const lodObject = new LOD();
    
    // Clone the original model for highest detail level
    const highDetail = originalModel.clone();
    lodObject.addLevel(highDetail, 0);
    
    // Create medium detail level (50% reduction)
    const mediumDetail = createSimplifiedModel(originalModel, 0.5);
    if (mediumDetail) lodObject.addLevel(mediumDetail, 10);
    
    // Create low detail level (80% reduction)
    const lowDetail = createSimplifiedModel(originalModel, 0.2);
    if (lowDetail) lodObject.addLevel(lowDetail, 50);
    
    return lodObject;
  }, [createSimplifiedModel]);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    
    setIsLoading(true);
    
    try {
      // Yield to UI thread before heavy processing
      await new Promise(resolve => setTimeout(resolve, 0));
      
      const object = await loadObjectFromFile(file);

      // Yield to UI thread periodically during processing
      await new Promise(resolve => setTimeout(resolve, 0));

      // Check if model is complex enough to need LOD
      let modelRoot: THREE.Object3D;
      let triangleCount = 0;
      
      object.traverse((child) => {
        if (child instanceof THREE.Mesh && child.geometry) {
          triangleCount += getTriangleCount(child.geometry);
        }
      });
      
      // Yield to UI thread
      await new Promise(resolve => setTimeout(resolve, 0));
      
      // Apply LOD for models with more than 100,000 triangles
      // But do it in a way that doesn't block the UI
      if (triangleCount > 100000) {
        // For very large models, skip LOD creation to avoid blocking
        // Just use the original model
        console.log(`Large model detected with ${triangleCount} triangles - skipping LOD to prevent UI freeze`);
        modelRoot = object;
      } else {
        modelRoot = object;
      }

      // Yield to UI thread
      await new Promise(resolve => setTimeout(resolve, 0));

      // Normalize transforms
      scaleObjectToUnit(modelRoot, unit, file.name);
      centerObject(modelRoot);

      // Yield to UI thread
      await new Promise(resolve => setTimeout(resolve, 0));

      // Add to scene
      const { scene, camera, controls, axes } = sceneRef.current;
      if (!scene || !camera) {
        setIsLoading(false);
        return;
      }

      clearCurrentModel();
      scene.add(modelRoot);
      sceneRef.current.modelRoot = modelRoot;
      setHasModel(true);

      // Enable frustum culling for better performance
      modelRoot.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.frustumCulled = true;
        }
      });

      // Frame the model
      const box = new THREE.Box3().setFromObject(modelRoot);
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

      // Compute metrics asynchronously to avoid blocking
      setTimeout(() => {
        try {
          const computed = computeModelMetrics(object);
          setMetrics(computed);
          onModelMetrics?.(computed);
        } catch (e) {
          console.error("Failed to compute metrics:", e);
        }
      }, 0);
      
      setIsLoading(false);
    } catch (e) {
      console.error("Failed to load model:", e);
      setIsLoading(false);
      alert(`Failed to load model: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  }, [unit, clearCurrentModel, onModelMetrics, getTriangleCount]);

  // Measurement helpers
  const handleAddMeasurementPoint = useCallback((point: THREE.Vector3) => {
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

    // Clear redo stack on new actions
    redoStackRef.current = [];
    
    // Add default annotation for the new point
    setAnnotations(prev => {
      const pointIndex = isChainMode ? prev.length : 0;
      const newAnnotations = isChainMode ? [...prev] : [];
      newAnnotations[pointIndex] = `Point ${pointIndex + 1}`;
      return newAnnotations;
    });

    // Call the store function to update state
    addMeasurementPoint(point);
  }, [isChainMode, addMeasurementPoint]);

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
    setAnnotations([]);
    setEditingAnnotation(null);
  }, []);

  const undoLastPoint = useCallback(() => {
    const { scene } = sceneRef.current;
    if (!scene || measurementMarkersRef.current.length === 0) return;
    const last = measurementMarkersRef.current.pop();
    if (last) {
      // push to redo stack
      redoStackRef.current.push(last.position.clone());
      scene.remove(last);
      last.geometry.dispose();
      (last.material as THREE.Material).dispose();
    }
    const updated = measurementPoints.slice(0, -1);
    if (measurementLineRef.current) {
      scene.remove(measurementLineRef.current);
      (measurementLineRef.current.geometry as THREE.BufferGeometry).dispose();
      (measurementLineRef.current.material as THREE.Material).dispose();
      measurementLineRef.current = null;
    }
    if (isChainMode) {
      if (updated.length >= 2) {
        const lineGeom = new THREE.BufferGeometry().setFromPoints(updated);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff });
        const line = new THREE.Line(lineGeom, lineMat);
        measurementLineRef.current = line;
        scene.add(line);
        let sum = 0;
        for (let i = 1; i < updated.length; i++) sum += updated[i - 1].distanceTo(updated[i]);
        setCumulativeDistance(sum);
        setMeasurementDistance(updated.length >= 2 ? updated[updated.length - 2].distanceTo(updated[updated.length - 1]) : null);
      } else {
        setCumulativeDistance(null);
        setMeasurementDistance(null);
      }
    } else {
      if (updated.length === 2) {
        const lineGeom = new THREE.BufferGeometry().setFromPoints(updated);
        const lineMat = new THREE.LineBasicMaterial({ color: 0x00ffff });
        const line = new THREE.Line(lineGeom, lineMat);
        measurementLineRef.current = line;
        scene.add(line);
        setMeasurementDistance(updated[0].distanceTo(updated[1]));
      } else {
        setMeasurementDistance(null);
      }
    }
    setMeasurementPoints(updated);
  }, [isChainMode, measurementPoints, setMeasurementPoints]);

  const redoLastPoint = useCallback(() => {
    const pt = redoStackRef.current.pop();
    if (!pt) return;
    handleAddMeasurementPoint(pt);
  }, [handleAddMeasurementPoint]);
  
  // Export measurement data as CSV or JSON
  const exportMeasurementData = useCallback((format: 'csv' | 'json') => {
    if (measurementPoints.length === 0) return;
    
    const metersPerUnit = unit === "meters" ? 1 : unit === "centimeters" ? 0.01 : 0.001;
    const unitLabel = unit === "meters" ? "m" : unit === "centimeters" ? "cm" : "mm";
    
    let content: string;
    let filename: string;
    let mimeType: string;
    
    if (format === 'csv') {
      // Create CSV content
      const headers = ['Point', 'X', 'Y', 'Z', `Distance (${unitLabel})`];
      const rows = measurementPoints.map((point: THREE.Vector3, index: number) => {
        const distance = index > 0 
          ? (measurementPoints[index-1].distanceTo(point) / metersPerUnit).toFixed(4)
          : '';
        return [
          index + 1,
          (point.x / metersPerUnit).toFixed(4),
          (point.y / metersPerUnit).toFixed(4),
          (point.z / metersPerUnit).toFixed(4),
          distance
        ].join(',');
      });
      
      content = [headers.join(','), ...rows].join('\n');
      filename = `measurements_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.csv`;
      mimeType = 'text/csv';
    } else {
      // Create JSON content
      const points = measurementPoints.map((point: THREE.Vector3, index: number) => {
        const distance = index > 0 
          ? measurementPoints[index-1].distanceTo(point) / metersPerUnit
          : null;
        return {
          index: index + 1,
          position: {
            x: point.x / metersPerUnit,
            y: point.y / metersPerUnit,
            z: point.z / metersPerUnit
          },
          distance
        };
      });
      
      const data = {
        unit: unitLabel,
        points,
        totalDistance: cumulativeDistance !== null ? cumulativeDistance / metersPerUnit : null,
        timestamp: new Date().toISOString()
      };
      
      content = JSON.stringify(data, null, 2);
      filename = `measurements_${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
      mimeType = 'application/json';
    }
    
    // Create and trigger download
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [measurementPoints, unit, cumulativeDistance]);
  
  // Capture screenshot of the current view
  const captureScreenshot = useCallback(() => {
    const { renderer, scene, camera } = sceneRef.current;
    if (!renderer || !scene || !camera) return;
    
    // Render the scene
    renderer.render(scene, camera);
    
    // Get the canvas data as a data URL
    const dataURL = renderer.domElement.toDataURL('image/png');
    
    // Create and trigger download
    const link = document.createElement('a');
    link.href = dataURL;
    link.download = `3d-view-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  const handleMeasureMove = useCallback((ev: PointerEvent) => {
    // Mark as dragging if movement exceeds threshold after a pointerdown
    if (downPosRef.current) {
      const dx = Math.abs(ev.clientX - downPosRef.current.x);
      const dy = Math.abs(ev.clientY - downPosRef.current.y);
      if (dx > DRAG_THRESHOLD || dy > DRAG_THRESHOLD) isDraggingRef.current = true;
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

  // Drag detection refs and handlers
  const downPosRef = useRef<{ x: number; y: number } | null>(null);
  const isDraggingRef = useRef(false);

  // View preset functions
  const setTopView = useCallback(() => {
    const { camera, controls, modelRoot } = sceneRef.current;
    if (!camera || !controls || !modelRoot) return;

    const box = new THREE.Box3().setFromObject(modelRoot);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / Math.tan(fov * 0.5));

    camera.position.set(center.x, center.y + cameraZ, center.z);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
  }, []);
  
  const setFrontView = useCallback(() => {
    const { camera, controls, modelRoot } = sceneRef.current;
    if (!camera || !controls || !modelRoot) return;

    const box = new THREE.Box3().setFromObject(modelRoot);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / Math.tan(fov * 0.5));

    camera.position.set(center.x, center.y, center.z + cameraZ);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
  }, []);

  const setSideView = useCallback(() => {
    const { camera, controls, modelRoot } = sceneRef.current;
    if (!camera || !controls || !modelRoot) return;

    const box = new THREE.Box3().setFromObject(modelRoot);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = camera.fov * (Math.PI / 180);
    let cameraZ = Math.abs(maxDim / Math.tan(fov * 0.5));

    camera.position.set(center.x + cameraZ, center.y, center.z);
    camera.lookAt(center);
    controls.target.copy(center);
    controls.update();
  }, []);

  const handlePointerDown = useCallback((ev: PointerEvent) => {
    if (ev.button !== 0) return;
    isDraggingRef.current = false;
    downPosRef.current = { x: ev.clientX, y: ev.clientY };
  }, []);

  const handlePointerUp = useCallback((ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const dp = downPosRef.current;
    const moved = dp ? Math.hypot(ev.clientX - dp.x, ev.clientY - dp.y) > DRAG_THRESHOLD : false;
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
      handleAddMeasurementPoint(candidate);
    }
  }, [handleAddMeasurementPoint, measurementPoints, resetMeasurement, snapToVertex, axisAlign, isChainMode]);

  useEffect(() => {
    const { renderer, controls } = sceneRef.current;
    if (!renderer || !controls) return;
    if (measurementMode) {
      const handleKeyDown = (e: KeyboardEvent) => {
        const key = e.key.toLowerCase();
        if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
          e.preventDefault();
          undoLastPoint();
        } else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
          e.preventDefault();
          redoLastPoint();
        }
      };
      window.addEventListener('keydown', handleKeyDown);
      renderer.domElement.addEventListener("pointerdown", handlePointerDown);
      renderer.domElement.addEventListener("pointerup", handlePointerUp);
      renderer.domElement.addEventListener("pointermove", handleMeasureMove);
      const handlePointerCancel = () => {
        downPosRef.current = null;
        isDraggingRef.current = false;
      };
      const handlePointerLeave = () => {
        downPosRef.current = null;
        isDraggingRef.current = false;
      };
      renderer.domElement.addEventListener("pointercancel", handlePointerCancel);
      renderer.domElement.addEventListener("pointerleave", handlePointerLeave);
      return () => {
        renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
        renderer.domElement.removeEventListener("pointerup", handlePointerUp);
        renderer.domElement.removeEventListener("pointermove", handleMeasureMove);
        window.removeEventListener('keydown', handleKeyDown);
        renderer.domElement.removeEventListener("pointercancel", handlePointerCancel);
        renderer.domElement.removeEventListener("pointerleave", handlePointerLeave);
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
    <TooltipProvider>
    <div className="relative h-full w-full bg-gray-950 rounded-md overflow-hidden" style={{ minHeight: '600px' }}>
      <div ref={containerRef} className="w-full h-full" style={{ minHeight: '600px' }} />
      
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm z-50">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <div className="text-muted-foreground text-lg mb-2">
              Loading Model...
            </div>
            <div className="text-muted-foreground/60 text-sm">
              Please wait while we process your file
            </div>
          </div>
        </div>
      )}
      
      {!hasModel && !isLoading && (
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
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              onClick={captureScreenshot}
              data-testid="button-screenshot"
            >
              <Camera className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Capture screenshot</TooltipContent>
        </Tooltip>
        
        {/* View preset buttons */}
        <div className="bg-secondary/80 rounded-md p-1 flex flex-col gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={setTopView}
                disabled={!hasModel}
                className="h-8 w-8"
                data-testid="button-top-view"
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Top view</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={setFrontView}
                disabled={!hasModel}
                className="h-8 w-8"
                data-testid="button-front-view"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Front view</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={setSideView}
                disabled={!hasModel}
                className="h-8 w-8"
                data-testid="button-side-view"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Side view</TooltipContent>
          </Tooltip>
        </div>
        
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              onClick={() => setIsRotating(!isRotating)}
              data-testid="button-rotation-toggle"
            >
              <RotateCw className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle auto-rotate</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
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
          </TooltipTrigger>
          <TooltipContent>Zoom in</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
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
          </TooltipTrigger>
          <TooltipContent>Zoom out</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="secondary"
              size="icon"
              data-testid="button-fullscreen"
              onClick={() => containerRef.current?.requestFullscreen().catch(() => {})}
            >
              <Maximize2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Enter fullscreen</TooltipContent>
        </Tooltip>
      </div>
      
      <div className="absolute bottom-4 right-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={measurementMode ? "default" : "secondary"}
              onClick={onMeasurementToggle}
              data-testid="button-measurement-mode"
            >
              <Ruler className="h-4 w-4 mr-2" />
              {measurementMode ? "Exit Measurement" : "Measurement Mode"}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Toggle measurement mode</TooltipContent>
        </Tooltip>
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={isChainMode ? "default" : "secondary"} size="sm" className="text-xs" onClick={() => setIsChainMode(v => !v)}>
                  Chain
                </Button>
              </TooltipTrigger>
              <TooltipContent>Accumulate segments as a path</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={axisAlign ? "default" : "secondary"} size="sm" className="text-xs" onClick={() => setAxisAlign(v => !v)}>
                  Axis Align
                </Button>
              </TooltipTrigger>
              <TooltipContent>Lock movement to dominant axis</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant={snapToVertex ? "default" : "secondary"} size="sm" className="text-xs" onClick={() => setSnapToVertex(v => !v)}>
                  Snap Vertex
                </Button>
              </TooltipTrigger>
              <TooltipContent>Snap to nearest triangle vertex</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => { undoLastPoint(); }}>
                  Undo
                </Button>
              </TooltipTrigger>
              <TooltipContent>Undo (Ctrl+Z)</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" className="text-xs" onClick={() => { redoLastPoint(); }}>
                  Redo
                </Button>
              </TooltipTrigger>
              <TooltipContent>Redo (Ctrl+Y or Ctrl+Shift+Z)</TooltipContent>
            </Tooltip>
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
          <div className="pt-1 flex gap-2 flex-wrap">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="sm" onClick={resetMeasurement} className="text-xs">Reset</Button>
              </TooltipTrigger>
              <TooltipContent>Clear all measurement points</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => exportMeasurementData('csv')} 
                  disabled={measurementPoints.length === 0}
                  className="text-xs"
                >
                  <Download className="h-3 w-3 mr-1" />
                  CSV
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export measurements as CSV</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => exportMeasurementData('json')} 
                  disabled={measurementPoints.length === 0}
                  className="text-xs"
                >
                  <Download className="h-3 w-3 mr-1" />
                  JSON
                </Button>
              </TooltipTrigger>
              <TooltipContent>Export measurements as JSON</TooltipContent>
            </Tooltip>
            
            <Tooltip>
              <TooltipTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setShowAnnotations(!showAnnotations)} 
                  className="text-xs"
                >
                  {showAnnotations ? "Hide Labels" : "Show Labels"}
                </Button>
              </TooltipTrigger>
              <TooltipContent>Toggle point annotations</TooltipContent>
            </Tooltip>
            
            <MeasurementReport 
              measurementPoints={measurementPoints}
              annotations={annotations}
              unit={unit}
              cumulativeDistance={cumulativeDistance}
            />
          </div>
          
          {showAnnotations && measurementPoints.length > 0 && (
            <div className="mt-2 border-t border-gray-700 pt-2">
              <div className="text-xs font-medium mb-1">Point Annotations</div>
              <div className="max-h-32 overflow-y-auto">
                {measurementPoints.map((_: THREE.Vector3, index: number) => (
                  <div key={index} className="flex items-center gap-2 mb-1">
                    <div className="text-xs w-14">Point {index + 1}:</div>
                    {editingAnnotation === index ? (
                      <input
                        type="text"
                        className="flex-1 text-xs bg-gray-800 border border-gray-600 rounded px-2 py-1"
                        value={annotations[index] || ''}
                        onChange={(e) => {
                          const newAnnotations = [...annotations];
                          newAnnotations[index] = e.target.value;
                          setAnnotations(newAnnotations);
                        }}
                        onBlur={() => setEditingAnnotation(null)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setEditingAnnotation(null);
                        }}
                        autoFocus
                      />
                    ) : (
                      <div 
                        className="flex-1 text-xs px-2 py-1 cursor-pointer hover:bg-gray-800 rounded"
                        onClick={() => setEditingAnnotation(index)}
                      >
                        {annotations[index] || `Point ${index + 1}`}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}