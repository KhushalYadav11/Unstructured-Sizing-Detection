import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { MTLLoader } from "three/examples/jsm/loaders/MTLLoader.js";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";

export type ModelMetrics = {
  boundingBox: {
    min: THREE.Vector3;
    max: THREE.Vector3;
    size: THREE.Vector3;
  };
  dimensions: {
    length: number; // x (meters)
    width: number;  // z (meters)
    height: number; // y (meters)
  };
  volume: number; // cubic meters
  triangles: number;
};

export type Unit = "meters" | "centimeters" | "millimeters";

export async function loadObjectFromFile(file: File): Promise<THREE.Object3D> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".gltf") || name.endsWith(".glb")) {
    const buffer = await file.arrayBuffer();
    const loader = new GLTFLoader();
    const scene = await new Promise<THREE.Object3D>((resolve, reject) => {
      loader.parse(
        buffer,
        "",
        (gltf) => resolve(gltf.scene || gltf.scenes?.[0] || new THREE.Group()),
        (err) => reject(err)
      );
    });
    return scene;
  }

  if (name.endsWith(".obj")) {
    const text = await file.text();
    const loader = new OBJLoader();
    const obj = loader.parse(text);

    // If the user also dropped / selected an MTL file alongside the OBJ,
    // it will be in the same FileList. We can't do async MTL loading from a
    // File object here (no URL), but we apply a good default material so the
    // mesh at least looks like coal rather than plain white/grey.
    obj.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (mesh.isMesh && (!mesh.material ||
          (mesh.material as THREE.MeshBasicMaterial).color?.getHex() === 0xffffff)) {
        mesh.material = new THREE.MeshStandardMaterial({
          color: 0x5a4f3e,
          roughness: 0.85,
          metalness: 0.05,
        });
      }
    });

    return obj;
  }

  if (name.endsWith(".stl")) {
    const buffer = await file.arrayBuffer();
    const loader = new STLLoader();
    const geom = loader.parse(buffer);
    geom.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ color: 0x7a7a7a, metalness: 0.1, roughness: 0.8 });
    return new THREE.Mesh(geom, material);
  }

  throw new Error("Unsupported file format. Supported: .obj, .stl, .gltf, .glb");
}

export function scaleObjectToUnit(object: THREE.Object3D, unit: Unit, fileNameHint?: string): number {
  // meters per unit
  let metersPerUnit = 1;
  if (unit === "centimeters") metersPerUnit = 0.01;
  if (unit === "millimeters") metersPerUnit = 0.001;

  // If STL and unit not explicitly specified (heuristic), STLs are commonly in mm
  if (!unit && fileNameHint?.toLowerCase().endsWith(".stl")) {
    metersPerUnit = 0.001;
  }

  object.scale.setScalar(metersPerUnit);
  object.updateMatrixWorld(true);
  return metersPerUnit;
}

export function centerObject(object: THREE.Object3D): void {
  const box = new THREE.Box3().setFromObject(object);
  const center = box.getCenter(new THREE.Vector3());
  object.position.sub(center);
  object.updateMatrixWorld(true);
}

export function computeModelMetrics(object: THREE.Object3D): ModelMetrics {
  object.updateMatrixWorld(true);

  // Bounding box and dimensions (in meters if scaled accordingly)
  const box = new THREE.Box3().setFromObject(object);
  const size = box.getSize(new THREE.Vector3());

  // Volume estimation by summing signed volumes of triangles
  let triangles = 0;
  let volume = 0;

  const tempGeometry = new THREE.BufferGeometry();
  const vA = new THREE.Vector3();
  const vB = new THREE.Vector3();
  const vC = new THREE.Vector3();

  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geom = (mesh.geometry as THREE.BufferGeometry).clone();
    geom.applyMatrix4(mesh.matrixWorld);

    const indexed = geom.index !== null;
    let position = geom.getAttribute("position");

    if (indexed) {
      const index = geom.getIndex();
      if (!index) return;
      const array = index.array as ArrayLike<number>;
      for (let i = 0; i < array.length; i += 3) {
        const i0 = array[i] * 3;
        const i1 = array[i + 1] * 3;
        const i2 = array[i + 2] * 3;
        vA.set(position.getX(i0 / 3), position.getY(i0 / 3), position.getZ(i0 / 3));
        vB.set(position.getX(i1 / 3), position.getY(i1 / 3), position.getZ(i1 / 3));
        vC.set(position.getX(i2 / 3), position.getY(i2 / 3), position.getZ(i2 / 3));
        volume += signedTetraVolume(vA, vB, vC);
        triangles += 1;
      }
    } else {
      // Non-indexed
      const array = position.array as ArrayLike<number>;
      for (let i = 0; i < array.length; i += 9) {
        vA.set(array[i + 0], array[i + 1], array[i + 2]);
        vB.set(array[i + 3], array[i + 4], array[i + 5]);
        vC.set(array[i + 6], array[i + 7], array[i + 8]);
        volume += signedTetraVolume(vA, vB, vC);
        triangles += 1;
      }
    }

    geom.dispose();
  });

  volume = Math.abs(volume);

  return {
    boundingBox: { min: box.min.clone(), max: box.max.clone(), size },
    dimensions: { length: size.x, width: size.z, height: size.y },
    volume,
    triangles,
  };
}

function signedTetraVolume(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3): number {
  // Volume of tetrahedron formed by triangle ABC and origin
  return a.dot(b.clone().cross(c)) / 6.0;
}

// --- Coal Pile Accuracy Utilities ---

export interface CoalPileMetrics {
  planeOrigin: THREE.Vector3;
  planeNormal: THREE.Vector3;
  dimensions: { length: number; width: number; height: number };
  volume: number;
}

/**
 * Estimate a ground plane from the lowest percentile of mesh vertices (world space).
 * Uses PCA on bottom-percent points to get a robust plane normal.
 */
export function estimateGroundPlane(object: THREE.Object3D, bottomPercent = 0.1): { origin: THREE.Vector3; normal: THREE.Vector3 } {
  const points: THREE.Vector3[] = [];
  object.updateMatrixWorld(true);
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const geom = mesh.geometry as THREE.BufferGeometry;
    const pos = geom.getAttribute("position") as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i += Math.max(1, Math.floor(pos.count / 5000))) {
      const v = new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));
      v.applyMatrix4(mesh.matrixWorld);
      points.push(v);
    }
  });

  if (points.length < 3) {
    // Fallback to global XY plane
    return { origin: new THREE.Vector3(0, 0, 0), normal: new THREE.Vector3(0, 1, 0) };
  }

  // Sort by height (Y) and take bottom percentile
  points.sort((a, b) => a.y - b.y);
  const count = Math.max(3, Math.floor(points.length * bottomPercent));
  const subset = points.slice(0, count);

  // Compute mean
  const mean = subset.reduce((acc, p) => acc.add(p), new THREE.Vector3()).multiplyScalar(1 / subset.length);

  // Compute covariance matrix of subset
  let cxx = 0, cxy = 0, cxz = 0, cyy = 0, cyz = 0, czz = 0;
  for (const p of subset) {
    const x = p.x - mean.x;
    const y = p.y - mean.y;
    const z = p.z - mean.z;
    cxx += x * x; cxy += x * y; cxz += x * z;
    cyy += y * y; cyz += y * z; czz += z * z;
  }
  const n = subset.length;
  cxx /= n; cxy /= n; cxz /= n; cyy /= n; cyz /= n; czz /= n;

  // Solve for smallest eigenvector of covariance matrix (approximate via power iterations on inverse)
  // Simple heuristic: try three initial normals and refine
  const candidates = [
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(0, 0, 1),
  ];
  function covMul(v: THREE.Vector3): THREE.Vector3 {
    // Multiply covariance matrix by vector v
    return new THREE.Vector3(
      cxx * v.x + cxy * v.y + cxz * v.z,
      cxy * v.x + cyy * v.y + cyz * v.z,
      cxz * v.x + cyz * v.y + czz * v.z,
    );
  }
  let normal = new THREE.Vector3(0, 1, 0);
  let minVal = Number.POSITIVE_INFINITY;
  for (const init of candidates) {
    let v = init.clone().normalize();
    // Power iteration variants to approximate smallest eigenvector using inverse iteration
    for (let i = 0; i < 12; i++) {
      const w = covMul(v);
      const len = w.length();
      if (len > 1e-8) v.copy(w).divideScalar(len);
    }
    const val = covMul(v).dot(v);
    if (val < minVal) { minVal = val; normal.copy(v); }
  }
  normal.normalize();

  // Ensure normal points upward relative to world Y
  if (normal.y < 0) normal.multiplyScalar(-1);
  return { origin: mean, normal };
}

/**
 * Compute coal pile metrics by raycasting along the estimated ground plane normal
 * and integrating height over a grid. This assumes no overhangs (typical for piles).
 */
export function computeCoalPileMetrics(object: THREE.Object3D, options?: { gridResolution?: number; bottomPercent?: number }): CoalPileMetrics {
  const gridResolution = options?.gridResolution ?? 0.1; // meters per cell
  const bottomPercent = options?.bottomPercent ?? 0.1;

  const { origin, normal } = estimateGroundPlane(object, bottomPercent);

  // Build local frame (u, v, n)
  const n = normal.clone().normalize();
  const arbitrary = Math.abs(n.dot(new THREE.Vector3(1, 0, 0))) < 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
  const u = arbitrary.clone().sub(n.clone().multiplyScalar(arbitrary.dot(n))).normalize();
  const v = new THREE.Vector3().crossVectors(n, u).normalize();

  // Bounding box in local UV frame
  const box = new THREE.Box3().setFromObject(object);
  const corners = [
    new THREE.Vector3(box.min.x, box.min.y, box.min.z),
    new THREE.Vector3(box.min.x, box.min.y, box.max.z),
    new THREE.Vector3(box.min.x, box.max.y, box.min.z),
    new THREE.Vector3(box.min.x, box.max.y, box.max.z),
    new THREE.Vector3(box.max.x, box.min.y, box.min.z),
    new THREE.Vector3(box.max.x, box.min.y, box.max.z),
    new THREE.Vector3(box.max.x, box.max.y, box.min.z),
    new THREE.Vector3(box.max.x, box.max.y, box.max.z),
  ];
  const toLocal = (p: THREE.Vector3) => new THREE.Vector3(
    p.clone().sub(origin).dot(u),
    p.clone().sub(origin).dot(v),
    p.clone().sub(origin).dot(n),
  );
  const uvBounds = corners.map(toLocal);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const q of uvBounds) {
    minU = Math.min(minU, q.x); maxU = Math.max(maxU, q.x);
    minV = Math.min(minV, q.y); maxV = Math.max(maxV, q.y);
  }

  // Raycaster setup
  const raycaster = new THREE.Raycaster();
  raycaster.firstHitOnly = true as any; // prefer first hit

  // For performance, merge meshes into a group reference
  const target = new THREE.Group();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    const clone = mesh.clone();
    // Ensure world transforms are baked
    clone.updateMatrixWorld(true);
    target.add(clone);
  });

  const area = gridResolution * gridResolution;
  let volume = 0;
  let minHeight = Infinity, maxHeight = -Infinity;
  let minUx = Infinity, maxUx = -Infinity, minVy = Infinity, maxVy = -Infinity;

  // Cap sampling density to avoid UI lockups
  const maxCells = 20000;
  const uSpan = maxU - minU;
  const vSpan = maxV - minV;
  let uStep = gridResolution;
  let vStep = gridResolution;
  const estCells = Math.ceil(uSpan / uStep) * Math.ceil(vSpan / vStep);
  if (estCells > maxCells) {
    const scale = Math.sqrt(estCells / maxCells);
    uStep *= scale;
    vStep *= scale;
  }

  for (let uVal = minU; uVal <= maxU; uVal += uStep) {
    for (let vVal = minV; vVal <= maxV; vVal += vStep) {
      // World-space point above the plane at some offset along +n
      const planePoint = origin.clone().add(u.clone().multiplyScalar(uVal)).add(v.clone().multiplyScalar(vVal));
      const rayOrigin = planePoint.clone().add(n.clone().multiplyScalar(10 * Math.max(uSpan, vSpan))); // far above
      const rayDir = n.clone().multiplyScalar(-1);
      raycaster.set(rayOrigin, rayDir);
      const hits = raycaster.intersectObject(target, true);
      if (hits.length > 0) {
        const p = hits[0].point;
        const height = p.clone().sub(planePoint).dot(n);
        if (height > 0) {
          volume += height * area;
          minHeight = Math.min(minHeight, height);
          maxHeight = Math.max(maxHeight, height);
          minUx = Math.min(minUx, uVal); maxUx = Math.max(maxUx, uVal);
          minVy = Math.min(minVy, vVal); maxVy = Math.max(maxVy, vVal);
        }
      }
    }
  }

  // Dimensions along plane axes and height
  const length = Math.max(0, maxUx - minUx);
  const width = Math.max(0, maxVy - minVy);
  const height = Math.max(0, maxHeight);

  return {
    planeOrigin: origin,
    planeNormal: n,
    dimensions: { length, width, height },
    volume,
  };
}
