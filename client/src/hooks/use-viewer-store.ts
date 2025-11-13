import create from 'zustand';
import * as THREE from 'three';

export type Unit = 'meters' | 'centimeters' | 'millimeters';

export interface ModelMetrics {
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
  volume: number;
  triangles: number;
}

interface ViewerState {
  isRotating: boolean;
  hasModel: boolean;
  unit: Unit;
  metrics: ModelMetrics | null;
  measurementDistance: number | null;
  measurementPoints: THREE.Vector3[];
  cumulativeDistance: number | null;
  isChainMode: boolean;
  snapToVertex: boolean;
  axisAlign: boolean;
  showAnnotations: boolean;
  editingAnnotation: number | null;
  annotations: string[];
  gridSize: number;
  gridDivisions: number;
  showGrid: boolean;
  volumeCalculationMode: boolean;
  calculatedVolume: number | null;
  showVolumeMesh: boolean;
  measurementRedoStack: THREE.Vector3[];

  // Actions
  setIsRotating: (isRotating: boolean) => void;
  setHasModel: (hasModel: boolean) => void;
  setUnit: (unit: Unit) => void;
  setMetrics: (metrics: ModelMetrics | null) => void;
  setMeasurementDistance: (distance: number | null) => void;
  setMeasurementPoints: (points: THREE.Vector3[]) => void;
  addMeasurementPoint: (point: THREE.Vector3) => void;
  undoLastMeasurementPoint: () => void;
  redoLastMeasurementPoint: () => void;
  resetMeasurement: () => void;
  setCumulativeDistance: (distance: number | null) => void;
  setIsChainMode: (isChainMode: boolean) => void;
  setSnapToVertex: (snapToVertex: boolean) => void;
  setAxisAlign: (axisAlign: boolean) => void;
  setShowAnnotations: (show: boolean) => void;
  setEditingAnnotation: (index: number | null) => void;
  setAnnotations: (annotations: string[]) => void;
  setGridSize: (size: number) => void;
  setGridDivisions: (divisions: number) => void;
  setShowGrid: (show: boolean) => void;
  setVolumeCalculationMode: (mode: boolean) => void;
  setCalculatedVolume: (volume: number | null) => void;
  setShowVolumeMesh: (show: boolean) => void;
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  isRotating: false,
  hasModel: false,
  unit: 'meters',
  metrics: null,
  measurementDistance: null,
  measurementPoints: [],
  cumulativeDistance: null,
  isChainMode: false,
  snapToVertex: false,
  axisAlign: false,
  showAnnotations: true,
  editingAnnotation: null,
  annotations: [],
  gridSize: 20,
  gridDivisions: 20,
  showGrid: true,
  volumeCalculationMode: false,
  calculatedVolume: null,
  showVolumeMesh: true,
  measurementRedoStack: [],

  setIsRotating: (isRotating) => set({ isRotating }),
  setHasModel: (hasModel) => set({ hasModel }),
  setUnit: (unit) => set({ unit }),
  setMetrics: (metrics) => set({ metrics }),
  setMeasurementDistance: (distance) => set({ measurementDistance: distance }),
  setMeasurementPoints: (points) => set({ measurementPoints: points }),
  addMeasurementPoint: (point) =>
    set((state) => ({
      measurementPoints: [...state.measurementPoints, point],
      measurementRedoStack: [], // Clear redo stack on new point
    })),
  undoLastMeasurementPoint: () =>
    set((state) => {
      const newPoints = [...state.measurementPoints];
      const lastPoint = newPoints.pop();
      if (lastPoint) {
        return {
          measurementPoints: newPoints,
          measurementRedoStack: [...state.measurementRedoStack, lastPoint],
        };
      }
      return state;
    }),
  redoLastMeasurementPoint: () =>
    set((state) => {
      const newRedoStack = [...state.measurementRedoStack];
      const pointToRedo = newRedoStack.pop();
      if (pointToRedo) {
        return {
          measurementPoints: [...state.measurementPoints, pointToRedo],
          measurementRedoStack: newRedoStack,
        };
      }
      return state;
    }),
  resetMeasurement: () =>
    set({
      measurementPoints: [],
      measurementDistance: null,
      cumulativeDistance: null,
      annotations: [],
      editingAnnotation: null,
      calculatedVolume: null,
      measurementRedoStack: [],
    }),
  setCumulativeDistance: (distance) => set({ cumulativeDistance: distance }),
  setIsChainMode: (isChainMode) => set({ isChainMode }),
  setSnapToVertex: (snapToVertex) => set({ snapToVertex }),
  setAxisAlign: (axisAlign) => set({ axisAlign }),
  setShowAnnotations: (show) => set({ showAnnotations: show }),
  setEditingAnnotation: (index) => set({ editingAnnotation: index }),
  setAnnotations: (annotations) => set({ annotations }),
  setGridSize: (size) => set({ gridSize: size }),
  setGridDivisions: (divisions) => set({ gridDivisions: divisions }),
  setShowGrid: (show) => set({ showGrid: show }),
  setVolumeCalculationMode: (mode) =>
    set({
      volumeCalculationMode: mode,
      measurementPoints: [], // Reset points when changing mode
      calculatedVolume: null,
      measurementRedoStack: [],
    }),
  setCalculatedVolume: (volume) => set({ calculatedVolume: volume }),
  setShowVolumeMesh: (show) => set({ showVolumeMesh: show }),
}));