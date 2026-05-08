import { storage } from "./storage.js";
import { routesLogger } from "./logger.js";

export type NotificationEvent = "grabbed" | "imported" | "failed" | "released";

export interface NotificationPayload {
  event: NotificationEvent;
  gameTitle?: string;
  releaseName?: string;
  error?: string;
}

export async function sendNotification(payload: NotificationPayload): Promise<void> {
  let connectors;
  try {
    connectors = await storage.getConnectors();
  } catch (err) {
    routesLogger.error({ err }, "Failed to load connectors for notification");
    return;
  }

  for (const connector of connectors) {
    if (!connector.enabled) continue;
    const events = connector.events as string[];
    if (!events.includes(payload.event)) continue;
    try {
      const response = await fetch(connector.url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) {
        routesLogger.warn(
          { connectorName: connector.name, status: response.status },
          "Connector returned non-OK status"
        );
      }
    } catch (err) {
      routesLogger.warn(
        { err, connectorName: connector.name },
        "Failed to send notification to connector"
      );
    }
  }
}
