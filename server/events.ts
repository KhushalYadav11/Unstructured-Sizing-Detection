import { Response } from "express";

export type ProjectEventType =
  | "reconstruction.status_changed"
  | "reconstruction.failed"
  | "reconstruction.ready"
  | "photos.uploaded"
  | "annotation.created"
  | "annotation.updated"
  | "annotation.deleted"
  | "measurement.created"
  | "measurement.updated"
  | "measurement.deleted"
  | "bookmark.created"
  | "bookmark.deleted";

export interface ProjectEvent {
  type: ProjectEventType;
  projectId: string;
  timestamp: string;
  data?: any;
}

class EventBroadcaster {
  private clients: Map<string, Set<Response>> = new Map();

  /**
   * Register a client for SSE updates on a specific project
   */
  addClient(projectId: string, res: Response): void {
    if (!this.clients.has(projectId)) {
      this.clients.set(projectId, new Set());
    }
    this.clients.get(projectId)!.add(res);

    // Send initial connection event
    this.sendToClient(res, {
      type: "connection.established" as ProjectEventType,
      projectId,
      timestamp: new Date().toISOString(),
    });

    // Clean up on client disconnect
    res.on("close", () => {
      this.removeClient(projectId, res);
    });
  }

  /**
   * Remove a client from receiving updates
   */
  removeClient(projectId: string, res: Response): void {
    const clients = this.clients.get(projectId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        this.clients.delete(projectId);
      }
    }
  }

  /**
   * Broadcast an event to all clients listening to a project
   */
  broadcast(projectId: string, event: Omit<ProjectEvent, "projectId" | "timestamp">): void {
    const clients = this.clients.get(projectId);
    if (!clients || clients.size === 0) {
      return;
    }

    const fullEvent: ProjectEvent = {
      ...event,
      projectId,
      timestamp: new Date().toISOString(),
    };

    const deadClients: Response[] = [];

    clients.forEach((client) => {
      try {
        this.sendToClient(client, fullEvent);
      } catch (error) {
        console.error("Failed to send event to client:", error);
        deadClients.push(client);
      }
    });

    // Clean up dead clients
    deadClients.forEach((client) => this.removeClient(projectId, client));
  }

  /**
   * Send an event to a specific client
   */
  private sendToClient(res: Response, event: ProjectEvent): void {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  }

  /**
   * Get the number of active clients for a project
   */
  getClientCount(projectId: string): number {
    return this.clients.get(projectId)?.size ?? 0;
  }

  /**
   * Get total number of active connections
   */
  getTotalClientCount(): number {
    let total = 0;
    this.clients.forEach((clients) => {
      total += clients.size;
    });
    return total;
  }
}

export const eventBroadcaster = new EventBroadcaster();