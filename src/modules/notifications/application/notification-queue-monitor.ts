export type NotificationQueueMetrics = {
  name: string;
  counts: {
    waiting: number;
    active: number;
    delayed: number;
    completed: number;
    failed: number;
    paused: number;
  };
};

export interface NotificationQueueMonitor {
  getMetrics(): Promise<NotificationQueueMetrics>;
}
