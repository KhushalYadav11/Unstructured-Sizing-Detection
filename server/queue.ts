import { EventEmitter } from "events";
import type { PhotogrammetryJob } from "@shared/schema";

export interface JobQueueItem {
  jobId: string;
  projectId: string;
  photoIds: string[];
  attempt: number;
}

export interface JobResult {
  success: boolean;
  artifacts?: {
    mesh?: { format: string; localPath: string };
    pointCloud?: { format: string; localPath: string };
    textures?: Array<{ name: string; localPath: string }>;
  };
  logsPath?: string;
  metrics?: {
    runtimeMs: number;
    avgCpu?: number;
    maxMemoryMb?: number;
  };
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Simple in-memory job queue for photogrammetry processing
 * In production, this should be replaced with Redis/BullMQ or similar
 */
class JobQueue extends EventEmitter {
  private queue: JobQueueItem[] = [];
  private processing: Set<string> = new Set();
  private maxConcurrent: number = 1;

  constructor(maxConcurrent: number = 1) {
    super();
    this.maxConcurrent = maxConcurrent;
  }

  /**
   * Add a job to the queue
   */
  enqueue(item: JobQueueItem): void {
    this.queue.push(item);
    this.emit("job:queued", item);
    this.processNext();
  }

  /**
   * Get the number of jobs in the queue
   */
  getQueueLength(): number {
    return this.queue.length;
  }

  /**
   * Get the number of jobs currently processing
   */
  getProcessingCount(): number {
    return this.processing.size;
  }

  /**
   * Check if a job is currently processing
   */
  isProcessing(jobId: string): boolean {
    return this.processing.has(jobId);
  }

  /**
   * Process the next job in the queue if capacity allows
   */
  private processNext(): void {
    if (this.processing.size >= this.maxConcurrent) {
      return;
    }

    const item = this.queue.shift();
    if (!item) {
      return;
    }

    this.processing.add(item.jobId);
    this.emit("job:started", item);

    // Process will be handled by worker
    // Worker will call completeJob when done
  }

  /**
   * Mark a job as completed and process next
   */
  completeJob(jobId: string, result: JobResult): void {
    this.processing.delete(jobId);
    this.emit("job:completed", { jobId, result });
    this.processNext();
  }

  /**
   * Mark a job as failed and process next
   */
  failJob(jobId: string, error: { code: string; message: string }): void {
    this.processing.delete(jobId);
    this.emit("job:failed", { jobId, error });
    this.processNext();
  }

  /**
   * Retry a failed job
   */
  retryJob(item: JobQueueItem): void {
    this.enqueue({ ...item, attempt: item.attempt + 1 });
  }

  /**
   * Clear all jobs from the queue
   */
  clear(): void {
    this.queue = [];
    this.processing.clear();
  }
}

export const jobQueue = new JobQueue(1);