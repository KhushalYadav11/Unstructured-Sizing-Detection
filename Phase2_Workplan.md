# Phase 2 Implementation Workplan

This workplan translates Phase 2 focus areas into actionable backend, worker, and frontend tasks. Use it to track progress and slice work into PR-sized chunks.

## Legend
- **[B]** Backend (Express server, storage, queue)
- **[W]** Worker/Infrastructure (photogrammetry runner, storage artifacts)
- **[F]** Frontend (React client)
- **[S]** Shared types/utilities

---

## Milestone 1 — Photogrammetry Foundations

1. **[S] Update Shared Types & Schemas**
   - Extend project schema with `photos`, `reconstructionStatus`, `reconstructionArtifacts`.
   - Add `PhotogrammetryJob`, `PhotoMetadata` interfaces.
   - Expand measurement/annotation/bookmark models.

2. **[B] Storage Layer Enhancements**
   - Implement persistent structures (extend in-memory for now; prepare for DB).
   - Add methods: `addProjectPhotos`, `getProjectPhotos`, `updateReconstructionStatus`, `createPhotogrammetryJob`, `updatePhotogrammetryJob`.

3. **[B] Storage Helpers**
   - Enhance `storage.ts` with deterministic photo/object key generation: `projects/{projectId}/photos/{uuid}.jpg`.
   - Add artifact path helpers: `projects/{projectId}/reconstruction/<asset>`.

4. **[B] Photo Upload Endpoint (`POST /api/projects/:id/photos`)**
   - Validate MIME/size/count.
   - Extract EXIF metadata (library TBD, e.g., `exifr`).
   - Compute SHA-256 hash; store metadata + keys.
   - On success, queue `StartPhotogrammetry` (if `kickoff=true`).

5. **[B] Reconstruction Status Endpoint (`GET /api/projects/:id/reconstruction`)**
   - Return current status, artifacts, latest job info.

6. **[B] Event Broadcasting**
   - Set up SSE or WebSocket server under `/api/projects/:id/events`.
   - Emit `photos.uploaded`, `reconstruction.status_changed`, etc.

7. **[W] Queue Setup**
   - Introduce job queue abstraction (in-memory stub or library like BullMQ).
   - Define job payload matching API contract.

8. **[W] Worker Stub**
   - Worker service that consumes `StartPhotogrammetry` jobs and updates storage.
   - For now, simulate photogrammetry output (mock artifacts) to unblock frontend.

---

## Milestone 2 — Photogrammetry Engine Integration

1. **[W] Photogrammetry Adapter**
   - Implement interface supporting CLI invocation (Meshroom) and placeholder for hosted API.
   - Handle temp file staging, execution, and error propagation.

2. **[W] Artifact Persistence**
   - Upload engine output bundle to storage using deterministic keys.
   - Capture logs and metrics.

3. **[B] Retry & Failure Handling**
   - Support configurable retry policy, update `PhotogrammetryJob` records.
   - Expose failure reasons via reconstruction endpoint.

4. **[B/W] WebSocket Notifications**
   - Emit events on job completion/failure.

5. **[B] Optional Retry Endpoint**
   - `POST /api/projects/:id/reconstruction/retry` if manual retry needed.

---

## Milestone 3 — Frontend Photo Workflow

1. **[F] API Client Updates (`client/src/lib/mesh-api.ts`)**
   - Add `uploadProjectPhotos`, `getProjectReconstruction`, `getMeasurements`, `createMeasurement`, etc.

2. **[F] React Query Hooks**
   - `useUploadProjectPhotos`, `useProjectReconstruction`, `useProjectMeasurements`, `useProjectAnnotations`, `useProjectBookmarks`.

3. **[F] Multi-Photo Upload UI**
   - Drag-and-drop panel with previews, validation (type/count/size).
   - Per-file progress + aggregate progress bar.

4. **[F] Reconstruction Status Module**
   - Display statuses (`queued`, `processing`, `failed`, `ready`).
   - Show retry button when failed.
   - Download/open viewer CTA when ready.

5. **[F] Real-Time Updates**
   - Connect to SSE/WebSocket channel.
   - Optimistically update UI on uploads; refresh status on events.

---

## Milestone 4 — Viewer Enhancements

1. **[S] Viewer Data Models**
   - Shared types for Measurements, Annotations, Bookmarks.

2. **[F] State Management**
   - Introduce zustand/context store for viewer mode, overlays, selections.

3. **[F] Scene Utilities (`three-utils.ts`)**
   - Raycasting helpers, gizmo overlays, camera alignment helpers.

4. **[F] Hooks**
   - `useMeasurementTool`: manage measurement capture, conversions, persistence.
   - `useAnnotationManager`: handle CRUD + backend sync.

5. **[F] Toolbar & HUD UI**
   - Modes: distance, area, volume, annotations, bookmarks.
   - HUD: scale legend, coordinate readout, status icons.

6. **[F] Measurement CRUD Integration**
   - Persist via new endpoints, show measurement list.
   - Support editing/deleting.

7. **[F] Annotation & Bookmark UI**
   - Add annotation list panel with search/filter.
   - Bookmark management (save, load camera pose).

8. **[F] Accessibility**
   - Keyboard shortcuts, focus management, accessible labels.

9. **[F] Performance & Fallbacks**
   - Lazy-loading heavy assets.
   - Toggle post-processing (outline, effects).
   - Low-powered device mode (reduced poly count, disable shadows).

---

## Milestone 5 — QA, Observability, & Documentation

1. **Test Plan**
   - End-to-end photo upload → reconstruction → viewer workflow.
   - Failure/retry scenarios.
   - Performance checks (photo upload concurrency, viewer FPS).

2. **Observability**
   - Add structured logging around photogrammetry stages.
   - Collect metrics (job duration, resource usage).

3. **Docs**
   - Update README + Implementation Summary with new features.
   - Document API usage examples.
   - Provide dev setup for photogrammetry engine dependencies.

4. **Acceptance Review**
   - Validate criteria (± tolerance measurements, responsive viewer, persistent annotations).

---

## Suggested Task Sequencing

1. **Finalize API contracts** *(completed)* ✔️
2. **Implement Milestone 1 tasks** (backend schema + photo upload + SSE)
3. **Pair on worker adapter & Engine integration**
4. **Frontend photo workflow**
5. **Viewer tools & data persistence**
6. **QA & documentation**

Keep commits scoped per task, e.g., `feat(server): add project photo schema`, `feat(worker): process photogrammetry job`, `feat(client): multi photo upload UI`. Update this plan as work progresses.