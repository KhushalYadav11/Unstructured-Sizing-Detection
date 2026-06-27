# Coal Assessment — Volume & Weight System

A full-stack web application for 3D reconstruction of coal piles from drone/camera photos, with automated volume and weight estimation.

---

## Architecture

```
┌─────────────────────────────────┐
│  React Frontend (Vite)          │  Port 5001
│  - Projects dashboard           │
│  - 3D Reconstruction page       │
│  - Project 3D Viewer            │
│  - Analytics & Reports          │
└────────────┬────────────────────┘
             │ HTTP / SSE
┌────────────▼────────────────────┐
│  Express.js Backend             │  Port 5001 (same process)
│  - REST API                     │
│  - In-memory storage            │
│  - Mesh volume processor        │
│  - Scale calibration            │
└────────────┬────────────────────┘
             │ REST API
┌────────────▼────────────────────┐
│  NodeODM (Docker)               │  Port 3000
│  - OpenDroneMap photogrammetry  │
│  - NVIDIA GPU acceleration      │
│  - OBJ + GLB + texture output   │
└─────────────────────────────────┘
```

**Secondary (research only):** `backend/` contains a Python/Meshroom pipeline — not connected to the UI.

---

## Quick Start

### Prerequisites

- **Node.js 20+**
- **Docker Desktop** with NVIDIA Container Toolkit (for GPU reconstruction)

### 1. Start NodeODM

```powershell
# CPU only
docker run -d -p 3000:3000 opendronemap/nodeodm

# With GPU (RTX 4060 or any NVIDIA GPU)
docker run -d -p 3000:3000 --gpus all opendronemap/nodeodm
```

Verify: open `http://localhost:3000` — should show NodeODM API info.

### 2. Install dependencies

```powershell
npm install
```

### 3. Run the app

```powershell
npm run dev
```

Open `http://localhost:5001`

---

## Reconstruction Workflow

1. Go to **3D Reconstruction** in the sidebar
2. Enter a project name
3. Select images (JPG/PNG, 20–200 overlapping photos)
4. Select coal type
5. Click **Start Reconstruction**
6. Answer the terminal Y/N prompt (Y = use reference model override for testing)
7. Monitor progress — the viewer loads automatically when done
8. Use the **Scale Calibration** card to fix scale if images had no GPS

Completed reconstructions are saved automatically to **Projects** with computed L/W/H, volume, and weight.

---

## Key Features

### 3D Reconstruction
- NodeODM (OpenDroneMap) photogrammetry engine
- NVIDIA GPU acceleration via CUDA (significantly faster than CPU)
- Works without GPS — uses `use-3dmesh` pipeline for ungeoreferenced images
- Real-time progress via SSE events

### 3D Viewer
- Textured model display (GLB preferred, OBJ+MTL fallback)
- PBR materials (`MeshStandardMaterial`) for correct colour rendering
- `SRGBColorSpace` + `ACESFilmicToneMapping` for accurate appearance

### Measurements
- Bounding box dimensions (L/W/H) in metres (+0.20 m calibration offset)
- Volume via DSM ground-subtraction (prismatoid integration)
- Weight = volume × coal density + 200 g offset
- All weights displayed in **grams**

### Scale Calibration
- For GPS-less images, enter a known real-world length
- Scale factor computed and applied to all dimensions/volume/weight
- Calibrated values saved back to the project

### Reference Model Override (dev tool)
- When starting reconstruction, the terminal asks Y/N
- Y: runs full NodeODM reconstruction, then swaps output with the reference model
- Reference directory: `REFERENCE_MODEL_DIR` env var (default: `C:\Users\KHUSHAL\Downloads\ImageToStl.com_8_5_2026`)

---

## Environment Variables

Create a `.env` file in the project root if needed:

```env
# NodeODM
NODE_ODM_URL=http://localhost:3000
NODE_ODM_FEATURE_QUALITY=high
NODE_ODM_PC_QUALITY=high
NODE_ODM_MESH_SIZE=300000
NODE_ODM_CUDA_DEVICE=0

# Reference model override (development)
REFERENCE_MODEL_DIR=C:\Users\KHUSHAL\Downloads\27_6_2026
```

---

## Project Structure

```
Coal-estimates/
├── client/src/
│   ├── components/
│   │   ├── 3DReconstruction.tsx   # Main reconstruction UI
│   │   ├── ProjectCard.tsx        # Project list card
│   │   └── ...
│   ├── pages/
│   │   ├── Projects.tsx           # Projects list
│   │   ├── ProjectViewer.tsx      # Per-project 3D viewer
│   │   ├── Dashboard.tsx
│   │   └── ...
│   └── lib/
│       ├── api.ts                 # HTTP client
│       ├── mesh-api.ts            # Mesh processing API
│       └── three-utils.ts         # Three.js utilities
├── server/
│   ├── worker.ts                  # NodeODM job worker + Y/N prompt
│   ├── nodeodm-client.ts          # NodeODM REST client
│   ├── mesh-processor.ts          # OBJ volume/weight calculator
│   ├── dsm-volume.ts              # DSM ground-subtraction volume
│   ├── scale-calibration.ts       # Scale factor utilities
│   ├── routes.ts                  # Main API routes
│   └── routes/
│       └── reconstruct.ts         # /api/reconstruct + /api/system/status
├── shared/
│   └── schema.ts                  # Shared TypeScript types
├── uploads/
│   └── projects/<id>/
│       ├── images/                # Uploaded source images
│       └── reconstruction/        # OBJ, MTL, GLB, textures
└── backend/                       # Python/Meshroom research pipeline
    └── README.md
```

---

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/projects` | List all projects |
| `GET` | `/api/projects/:id` | Get project by ID |
| `PATCH` | `/api/projects/:id` | Update project (dimensions, scale) |
| `POST` | `/api/reconstruct` | Start reconstruction (multipart images) |
| `GET` | `/api/reconstruct/:jobId` | Poll job status and artifacts |
| `GET` | `/api/system/status` | Check NodeODM availability |
| `POST` | `/api/mesh/process-by-url` | Compute volume/weight from mesh URL |
| `POST` | `/api/mesh/quality` | Get mesh quality stats |
| `GET` | `/api/analytics/overview` | Aggregated measurement stats |
| `GET` | `/api/projects/:id/events` | SSE stream for real-time updates |

---

## Running Tests

```powershell
npm test
```

---

## Troubleshooting

**Reconstruction fails immediately**
→ Check `docker ps` — NodeODM must be running on port 3000

**"No items match" in file picker**
→ Fixed: the file input no longer uses `webkitdirectory`. Select individual JPG/PNG files.

**Model loads without textures (grey)**
→ The viewer tries GLB first (textures embedded), then OBJ+MTL with `MeshStandardMaterial` upgrade. If still grey, check that texture PNG files were copied to the `reconstruction/` directory.

**Measurements are wrong scale**
→ Images without GPS produce unscaled meshes. Use the Scale Calibration card to enter the real pile length.

**Weight showing as kg instead of g**
→ All weight displays use grams. Stored value is kg; UI multiplies by 1000.
