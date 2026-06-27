import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import path from "path";

// Suppress PostCSS warning about missing 'from' option (only for console output)
process.env.POSTCSS_NO_WARN = "true";

const app = express();

// Create uploads directory if it doesn't exist
import fs from "fs";
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "../uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Periodic cleanup of old upload files
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
if (!(global as any).cleanup) {
  (global as any).cleanup = setInterval(() => {
    const uploadPath = path.join(__dirname, "../uploads");
    fs.readdir(uploadPath, (err, files) => {
      if (err) return;
      const now = Date.now();
      files.forEach(file => {
        const filePath = path.join(uploadPath, file);
        fs.stat(filePath, (err, stats) => {
          if (err) return;
          if (now - stats.mtimeMs > 24 * 60 * 60 * 1000) {
            fs.unlink(filePath, () => {});
          }
        });
      });
    });
  }, CLEANUP_INTERVAL);
}

app.use((req, res, next) => {
  // Set security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// CORS configuration
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.ALLOWED_ORIGINS || 'http://localhost:3000');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.header('Access-Control-Allow-Credentials', 'true');
  
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Body parsing with size limits (increased for large file uploads)
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: false, limit: '500mb' }));


// Serve uploaded files
app.use('/uploads', express.static(uploadsDir));

// Basic rate limiting (in production, use redis-based rate limiting)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();
const isDevelopment = process.env.NODE_ENV === 'development';
const RATE_LIMIT_WINDOW = isDevelopment ? 15 * 60 * 1000 : 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX_REQUESTS = isDevelopment ? 10000 : 500; // generous limits

app.use((req, res, next) => {
  // Skip rate limiting for static assets and Vite HMR
  if (req.path.includes('.') || req.path.startsWith('/src/') || req.path.startsWith('/@') || req.path.startsWith('/node_modules/')) {
    return next();
  }
  
  const clientId = req.ip || 'unknown';
  const now = Date.now();
  const clientData = rateLimitMap.get(clientId);
  
  if (!clientData || now > clientData.resetTime) {
    rateLimitMap.set(clientId, { count: 1, resetTime: now + RATE_LIMIT_WINDOW });
    next();
  } else if (clientData.count >= RATE_LIMIT_MAX_REQUESTS) {
    res.status(429).json({ error: 'Too many requests, please try again later' });
  } else {
    clientData.count++;
    next();
  }
});

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Register API routes
  const server = await registerRoutes(app);
  
    
  // Serve uploaded files
  app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    // Log the error but do not crash the server in dev/prod
    log(`Unhandled error: ${message}`, "error");
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5001 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5001', 10);
  server.listen({
    port,
    host: "127.0.0.1",
    reusePort: true,
  }, () => {
    log(`serving on port ${port}`);
    log(`Open http://localhost:${port} in your browser`);
  });
})();
