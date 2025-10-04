import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
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
