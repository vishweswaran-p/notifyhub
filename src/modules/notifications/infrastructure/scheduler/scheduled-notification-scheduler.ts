import type { Logger } from 'pino';

import type { PromoteScheduledNotificationsUseCase } from '../../application/promote-scheduled-notifications-use-case.js';

export class ScheduledNotificationScheduler {
  private interval: NodeJS.Timeout | null = null;
  private running = false;

  public constructor(
    private readonly params: {
      promoteScheduledNotificationsUseCase: PromoteScheduledNotificationsUseCase;
      intervalMs: number;
      batchSize: number;
      logger: Logger;
    },
  ) {}

  public start(): void {
    if (this.interval) {
      return;
    }

    void this.runOnce();
    this.interval = setInterval(() => {
      void this.runOnce();
    }, this.params.intervalMs);
  }

  public async runOnce(now = new Date()): Promise<void> {
    if (this.running) {
      this.params.logger.debug('Skipping scheduled notification tick because one is in progress.');
      return;
    }

    this.running = true;

    try {
      const result = await this.params.promoteScheduledNotificationsUseCase.execute({
        now,
        limit: this.params.batchSize,
      });

      if (result.promoted > 0) {
        this.params.logger.info(
          {
            promoted: result.promoted,
          },
          'Promoted scheduled notifications.',
        );
      }
    } catch (error) {
      this.params.logger.error(
        {
          err: error,
        },
        'Failed to promote scheduled notifications.',
      );
    } finally {
      this.running = false;
    }
  }

  public stop(): void {
    if (!this.interval) {
      return;
    }

    clearInterval(this.interval);
    this.interval = null;
  }
}
