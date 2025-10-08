# Coal Volume & Weight Estimation System

A comprehensive web application for automated coal pile volume and weight estimation using 3D photogrammetry and mesh analysis.

## 🚀 Features

### ✅ Implemented Features

- **Project Management**: Create, manage, and track coal assessment projects
- **Manual Measurements**: Input dimensions and calculate volume/weight using various methods
- **3D Mesh Analysis**: Upload .obj files for automated volume and weight calculation
- **Multiple Coal Types**: Support for different coal types with accurate density values
- **Analytics Dashboard**: Real-time overview of measurements and statistics
- **Responsive Design**: Modern UI built with React and TailwindCSS
- **File Upload**: Secure file handling with validation and cleanup

### 🔄 New in Phase 1

- **Automated Mesh Processing**: Upload .obj, .ply, or .stl files for automatic analysis
- **Volume Calculation**: Geometric analysis using divergence theorem
- **Weight Estimation**: Accurate weight calculation based on coal type density
- **Detailed Results**: Comprehensive analysis including surface area, bounding box, and mesh properties
- **Export Functionality**: Download analysis results in JSON format
- **File Validation**: Robust file format and size validation

## 🛠️ Tech Stack

### Frontend
- **React 18** with TypeScript
- **TailwindCSS** for styling
- **Radix UI** components
- **React Query** for data fetching
- **Wouter** for routing
- **Three.js** for 3D visualization

### Backend
- **Node.js** with Express
- **TypeScript** for type safety
- **Multer** for file uploads
- **Custom mesh processing** algorithms
- **In-memory storage** (easily extensible to database)

## 📁 Project Structure

```
Coal-estimates/
├── client/                 # React frontend
│   ├── src/
│   │   ├── components/     # Reusable UI components
│   │   ├── pages/          # Page components
│   │   ├── lib/            # Utilities and API functions
│   │   └── hooks/          # Custom React hooks
├── server/                 # Node.js backend
│   ├── mesh-processor.ts   # 3D mesh analysis engine
│   ├── upload-handler.ts   # File upload management
│   ├── routes.ts           # API endpoints
│   └── storage.ts          # Data storage layer
├── shared/                 # Shared types and schemas
└── uploads/                # Temporary file storage
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/KhushalYadav11/Coal-estimates.git
   cd Coal-estimates
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm run dev
   ```

4. **Access the application**
   - Open http://localhost:5000 in your browser
   - The server runs on port 5000 and serves both API and frontend

## 📊 Usage

### 3D Mesh Analysis

1. **Navigate to "3D Analysis"** from the sidebar
2. **Upload your 3D model** (.obj, .ply, or .stl format, max 50MB)
3. **Select coal type** for accurate density calculation
4. **Click "Process Mesh"** to start analysis
5. **View results** including volume, weight, and detailed mesh properties
6. **Export results** as JSON for record keeping

### Supported Coal Types

| Coal Type | Density (kg/m³) |
|-----------|----------------|
| Anthracite | 1500 |
| Bituminous Coal | 1300 |
| Sub-bituminous Coal | 1200 |
| Lignite | 1100 |
| Coking Coal | 1350 |
| Thermal Coal | 1250 |

### Manual Measurements

1. **Create a new project** from the dashboard
2. **Navigate to measurement page**
3. **Input dimensions** (length, width, height)
4. **Select coal type and volume method**
5. **Calculate results** automatically

## 🔧 API Endpoints

### Mesh Processing
- `POST /api/mesh/upload` - Upload and process 3D model
- `GET /api/mesh/coal-types` - Get available coal types
- `POST /api/mesh/validate` - Validate file without processing

### Projects
- `GET /api/projects` - List all projects
- `POST /api/projects` - Create new project
- `GET /api/projects/:id` - Get project details
- `PATCH /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Analytics
- `GET /api/analytics/overview` - Get system overview
- `GET /api/analytics/today` - Get today's measurement count

## 🧮 Volume Calculation Methods

The system supports multiple volume calculation approaches:

1. **Mesh-based (3D Analysis)**:
   - Uses divergence theorem for closed meshes
   - Calculates exact volume from 3D geometry
   - Most accurate for complex shapes

2. **Geometric Approximations**:
   - Truncated Pyramid (90% accuracy)
   - Ellipsoid Approximation (85% accuracy)
   - Conical Approximation (80% accuracy)
   - Rectangular with Fill Factor (75% accuracy)

## 🔒 Security Features

- File type validation
- File size limits (50MB)
- Automatic file cleanup
- Rate limiting
- Input sanitization
- CORS protection

## 🚧 Future Enhancements

### Phase 2 (Planned)
- **Photo Upload**: Direct photo upload for 3D reconstruction
- **Advanced 3D Viewer**: Interactive mesh visualization
- **Database Integration**: PostgreSQL/MongoDB support
- **User Authentication**: Multi-user support
- **Batch Processing**: Multiple file processing
- **Advanced Analytics**: Trend analysis and reporting

### Phase 3 (Future)
- **Mobile App**: React Native companion app
- **AI Integration**: Machine learning for quality assessment
- **Cloud Storage**: AWS/Azure integration
- **Real-time Collaboration**: Multi-user project editing

## 📈 Performance

- **File Processing**: Handles meshes up to 50MB
- **Response Time**: < 2s for typical .obj files
- **Memory Usage**: Efficient cleanup prevents memory leaks
- **Scalability**: Designed for horizontal scaling

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Meshroom** for 3D reconstruction capabilities
- **Three.js** community for 3D visualization tools
- **React** and **TailwindCSS** for excellent developer experience

## 📞 Support

For support, email khushalyadav11@gmail.com or create an issue on GitHub.

---

**Built with ❤️ for accurate coal assessment and inventory management**