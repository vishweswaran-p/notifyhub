import type {
  NotificationQueueMetrics,
  NotificationQueueMonitor,
} from './notification-queue-monitor.js';

export class GetQueueMetricsUseCase {
  public constructor(private readonly queueMonitor: NotificationQueueMonitor) {}

  public execute(): Promise<NotificationQueueMetrics> {
    return this.queueMonitor.getMetrics();
  }
}
