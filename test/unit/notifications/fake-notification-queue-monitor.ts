import type {
  NotificationQueueMetrics,
  NotificationQueueMonitor,
} from '@modules/notifications/application/notification-queue-monitor.js';

export class FakeNotificationQueueMonitor implements NotificationQueueMonitor {
  public metrics: NotificationQueueMetrics = {
    name: 'notification-delivery',
    counts: {
      waiting: 0,
      active: 0,
      delayed: 0,
      completed: 0,
      failed: 0,
      paused: 0,
    },
  };

  public getMetrics(): Promise<NotificationQueueMetrics> {
    return Promise.resolve(this.metrics);
  }
}
