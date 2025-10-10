# Phase 2 API Contracts

This document specifies the request/response shapes, status codes, and shared models needed for Phase 2 features. All endpoints share the existing authentication middleware used for mesh endpoints and return JSON payloads unless otherwise stated.

## General Conventions

- **Authentication**: Bearer token (Authorization header). Unauthorized requests → `401` with `{ "message": "Unauthorized" }`.
- **Validation Errors**: `422 Unprocessable Entity` with `{ "message": "Validation failed", "details": [{ "field": string, "code": string, "message"?: string }] }`.
- **Not Found**: `404` with `{ "message": "Resource not found" }`.
- **Server Errors**: `500` with `{ "message": "Internal Server Error", "requestId"?: string }`.
- **Timestamps**: ISO 8601 strings in UTC (e.g., `2025-10-11T03:24:55.123Z`).
- **IDs**: UUID v4 strings unless otherwise noted.
- **Enums**: Return lowercase strings (e.g., `"queued"`).
- **Pagination**: Where applicable, use `cursor` + `limit` query parameters (not required for Phase 2 endpoints yet).

---

## 1. Photo Upload & Reconstruction

### 1.1 `POST /api/projects/:projectId/photos`
Batch upload of project photos.

#### Request
- **Headers**
  - `Authorization: Bearer <token>`
  - `Content-Type: multipart/form-data`
- **Path Params**
  - `projectId` — UUID of the project.
- **Form Fields**
  - `files[]` — required; 1..N images (JPEG or PNG).
  - `kickoff` — optional boolean (`true`/`false`); defaults to `true`. If `false`, photogrammetry job is not queued automatically.

#### Constraints
- Max photo count: `N` (configurable; default 50).
- Max file size per photo: 50MB (configurable).
- MIME types: `image/jpeg`, `image/png`.

#### Successful Response `201`
```json
{
  "projectId": "b61f1b4d-03a3-4a5f-8c7c-08d44e67f042",
  "photos": [
    {
      "id": "51c8db9e-7cd6-4ba6-9657-962200c8c965",
      "originalFilename": "pile_001.jpg",
      "contentHash": "sha256:9c40...",
      "mimeType": "image/jpeg",
      "storageKey": "projects/b61f1b4d-03a3-4a5f-8c7c-08d44e67f042/photos/51c8db9e-7cd6-4ba6-9657-962200c8c965.jpg",
      "exif": {
        "focalLength": 35,
        "iso": 200,
        "captureTimestamp": "2025-10-10T19:22:15Z",
        "gps": {
          "lat": 37.1234,
          "lng": -122.4567,
          "alt": 22.5
        }
      },
      "uploadedAt": "2025-10-10T20:05:11.124Z"
    }
  ],
  "photogrammetryJob": {
    "id": "7b84e8dd-d5b0-4221-8c8f-5b4f0ac5ca87",
    "status": "queued",
    "queuedAt": "2025-10-10T20:05:11.200Z",
    "kickoff": true
  }
}
```

#### Failure Cases
- Too many photos: `422` with `details[ { field: "files", code: "too_many" } ]`.
- Unsupported MIME: `415` with `{ "message": "Unsupported media type" }`.
- Kickoff failure (queue unavailable): `503` with `{ "message": "Photogrammetry temporarily unavailable" }`. Photos remain stored; job can be retried later.

### 1.2 `GET /api/projects/:projectId/reconstruction`
Retrieve reconstruction status, progress, and artifacts.

#### Response `200`
```json
{
  "projectId": "b61f1b4d-03a3-4a5f-8c7c-08d44e67f042",
  "status": "ready",
  "progress": 100,
  "currentStep": "post_processing",
  "retryCount": 1,
  "lastUpdatedAt": "2025-10-10T20:35:01.332Z",
  "artifacts": {
    "mesh": {
      "format": "obj",
      "url": "/uploads/projects/…/mesh.obj",
      "sizeBytes": 17300450
    },
    "pointCloud": {
      "format": "ply",
      "url": "/uploads/projects/…/cloud.ply"
    },
    "textures": [
      {
        "name": "albedo.jpg",
        "url": "/uploads/projects/…/albedo.jpg",
        "sizeBytes": 1048576
      }
    ]
  },
  "latestJob": {
    "id": "7b84e8dd-d5b0-4221-8c8f-5b4f0ac5ca87",
    "status": "succeeded",
    "attempt": 2,
    "queuedAt": "2025-10-10T20:05:11.200Z",
    "startedAt": "2025-10-10T20:06:03.112Z",
    "finishedAt": "2025-10-10T20:34:58.882Z",
    "engine": "meshroom-cli@2024.1",
    "metrics": {
      "runtimeMs": 1735790,
      "avgCpu": 78.2,
      "maxMemoryMb": 6144
    },
    "logs": {
      "previewUrl": "/uploads/projects/…/logs/latest.log",
      "downloadUrl": "/uploads/projects/…/logs/latest.log"
    }
  },
  "failureReason": null
}
```

#### Status Enum
- `none`, `queued`, `processing`, `failed`, `ready`.

#### Failure Cases
- Project has no reconstruction record → return `status: "none"` with empty artifacts.
- If job queue down, `latestJob.status` may be `failed` with `failureReason` containing code message (e.g., `"engine_unavailable"`).

### 1.3 WebSocket / SSE Events
Event channel: `/api/projects/:projectId/events` (SSE) or `ws://.../projects/:projectId`.

Payload example:
```json
{
  "type": "reconstruction.status_changed",
  "projectId": "...",
  "status": "processing",
  "progress": 42,
  "timestamp": "2025-10-10T20:16:32.011Z"
}
```
Other event types: `reconstruction.failed`, `reconstruction.ready`, `photos.uploaded`.

---

## 2. Measurements API
Persist measurement overlays captured in the viewer.

### 2.1 Data Model
```ts
interface Measurement {
  id: string;
  projectId: string;
  type: "distance" | "area" | "volume";
  label?: string;
  units: "meters" | "feet" | "yards" | string;
  points: Array<{
    x: number;
    y: number;
    z: number;
    order: number;
  }>;
  value: number; // computed measurement value in base SI units
  metadata?: {
    displayUnits?: string;
    conversionFactor?: number;
    createdBy?: string;
    color?: string;
  };
  createdAt: string;
  updatedAt: string;
}
```

### 2.2 `GET /api/projects/:projectId/measurements`
- Returns all measurements for viewer display.

Response `200`:
```json
{
  "items": [ { /* Measurement */ } ]
}
```

### 2.3 `POST /api/projects/:projectId/measurements`
- Body (`application/json`):
```json
{
  "type": "distance",
  "label": "Ramp width",
  "units": "meters",
  "points": [
    { "x": 0.42, "y": 1.2, "z": 0.11 },
    { "x": 6.03, "y": 1.18, "z": 0.13 }
  ],
  "value": 5.61,
  "metadata": {
    "displayUnits": "meters",
    "color": "#00ff9c"
  }
}
```
- Response `201` returns the persisted `Measurement` record.

### 2.4 `PATCH /api/projects/:projectId/measurements/:measurementId`
- Body allows partial update (`label`, `units`, `points`, `value`, `metadata`).
- Response `200` with updated record.

### 2.5 `DELETE /api/projects/:projectId/measurements/:measurementId`
- Response `204 No Content`.

---

## 3. Annotations API
Annotations anchor comments to 3D coordinates.

### 3.1 Data Model
```ts
interface Annotation {
  id: string;
  projectId: string;
  title: string;
  body: string;
  authorId: string;
  anchor: {
    position: { x: number; y: number; z: number };
    normal?: { x: number; y: number; z: number };
  };
  attachments?: Array<{
    id: string;
    filename: string;
    url: string;
    sizeBytes: number;
    mimeType: string;
  }>;
  createdAt: string;
  updatedAt: string;
}
```

### 3.2 `GET /api/projects/:projectId/annotations`
Response `200`:
```json
{
  "items": [ { /* Annotation */ } ]
}
```

### 3.3 `POST /api/projects/:projectId/annotations`
- Body example:
```json
{
  "title": "Check erosion",
  "body": "Notice the slope collapsing on the south face.",
  "anchor": {
    "position": { "x": 2.3, "y": -1.1, "z": 0.4 }
  },
  "attachments": [
    {
      "id": "d871b9f9-1b92-4df4-9926-538969c7c5be",
      "filename": "reference.jpg",
      "url": "/uploads/projects/.../annotations/d871b9f9-1b92-4df4-9926-538969c7c5be.jpg",
      "sizeBytes": 125433,
      "mimeType": "image/jpeg"
    }
  ]
}
```
- Response `201` → persisted annotation with server stamps.

### 3.4 `PATCH /api/projects/:projectId/annotations/:annotationId`
- Partial updates for `title`, `body`, `anchor`, `attachments`.
- Response `200` updated annotation.

### 3.5 `DELETE /api/projects/:projectId/annotations/:annotationId`
- Response `204`.

### WebSocket Event
```json
{
  "type": "annotation.created",
  "projectId": "...",
  "annotation": { /* Annotation */ }
}
```
Include `annotation.updated`, `annotation.deleted` events for real-time sync.

---

## 4. Viewer Bookmarks API
Store camera presets per project.

### 4.1 Data Model
```ts
interface Bookmark {
  id: string;
  projectId: string;
  name: string;
  camera: {
    position: { x: number; y: number; z: number };
    target: { x: number; y: number; z: number };
    up: { x: number; y: number; z: number };
    fov: number;
  };
  createdBy: string;
  createdAt: string;
}
```

### 4.2 `GET /api/projects/:projectId/bookmarks`
- Response `200`: `{ "items": [ Bookmark ] }`.

### 4.3 `POST /api/projects/:projectId/bookmarks`
- Body: `name`, `camera` object.
- Response `201` with bookmark.

### 4.4 `DELETE /api/projects/:projectId/bookmarks/:bookmarkId`
- Response `204`.

WebSocket event types: `bookmark.created`, `bookmark.deleted`.

---

## 5. Photogrammetry Job Model

### 5.1 Persistence Schema
```ts
interface PhotogrammetryJob {
  id: string;
  projectId: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  attempt: number;
  failureReason?: {
    code: "engine_error" | "timeout" | "invalid_input" | "storage_error" | "unknown";
    message?: string;
  };
  queuedAt: string;
  startedAt?: string;
  finishedAt?: string;
  engine?: string;
  metrics?: {
    runtimeMs?: number;
    avgCpu?: number;
    maxMemoryMb?: number;
  };
  logs?: {
    previewUrl?: string;
    downloadUrl?: string;
  };
}
```

### 5.2 Worker Contract
```ts
interface PhotogrammetryWorkItem {
  projectId: string;
  photoTempPaths: string[];
  metadata: Array<{
    photoId: string;
    originalFilename: string;
    exif?: Record<string, unknown>;
  }>;
}

interface PhotogrammetryResult {
  artifacts: {
    mesh: { format: "obj" | "gltf"; localPath: string };
    pointCloud?: { format: "ply" | "las"; localPath: string };
    textures?: Array<{ name: string; localPath: string }>;
  };
  logsPath?: string;
  metrics?: {
    runtimeMs: number;
    avgCpu?: number;
    maxMemoryMb?: number;
  };
}
```

Worker flow:
1. Mark job `processing`.
2. Download photos to temp dir.
3. Invoke CLI/API engine with `photoTempPaths` + metadata.
4. Upload output bundle to storage (deterministic keys under `projects/{projectId}/reconstruction/`).
5. Update project `reconstructionStatus`, `reconstructionArtifacts`.
6. Emit WebSocket/SSE `reconstruction.ready` event.

---

## 6. Client Integration Notes

### React Query Hook Signatures
```ts
// Upload photos
function useUploadProjectPhotos(projectId: string, options?)
// Reconstruction status polling/listener
function useProjectReconstruction(projectId: string)
// Measurements CRUD
function useProjectMeasurements(projectId: string)
function useCreateMeasurement(projectId: string)
```

### WebSocket Listener Payload Union
```ts
type ProjectEvent =
  | { type: "reconstruction.status_changed"; projectId: string; status: string; progress?: number }
  | { type: "reconstruction.failed"; projectId: string; failureReason: string }
  | { type: "reconstruction.ready"; projectId: string; artifacts: { meshUrl: string; textures: string[] } }
  | { type: "annotation.created"; projectId: string; annotation: Annotation }
  | { type: "annotation.updated"; projectId: string; annotation: Annotation }
  | { type: "annotation.deleted"; projectId: string; annotationId: string }
  | { type: "measurement.created"; projectId: string; measurement: Measurement }
  | { type: "measurement.updated"; projectId: string; measurement: Measurement }
  | { type: "measurement.deleted"; projectId: string; measurementId: string }
  | { type: "bookmark.created"; projectId: string; bookmark: Bookmark }
  | { type: "bookmark.deleted"; projectId: string; bookmarkId: string };
```

### Error Handling
- Display toast for upload validation errors.
- If reconstruction fails, surface `failureReason.message` and show retry CTA hitting future `POST /api/projects/:projectId/reconstruction/retry` (to be defined when implementing worker retries).

---

## 7. Open Questions / To-Do
- Define maximum allowed retry attempts (`PhotogrammetryJob.retryCount`).
- Decide on storage backend abstraction (S3-compatible vs local) and credential handling for worker.
- Confirm whether annotations support rich-text formatting payload (HTML vs Markdown vs plain text). Current contract assumes plain text.
- Determine SSE vs WebSocket final approach. Current spec lists both; implementation must choose one for consistency.
- Future endpoint: `POST /api/projects/:projectId/reconstruction/retry` for manual retry control.

---

These contracts unblock backend schema updates, worker integration, and frontend React Query hook development. Any adjustments should be reflected here and in shared TypeScript types before implementation proceeds.