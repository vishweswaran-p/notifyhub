import type { Pool } from 'pg';

import type {
  CreateNotificationTemplateInput,
  NotificationTemplateRepository,
} from '../../application/notification-template-repository.js';
import type { NotificationTemplate } from '../../domain/notification-template.js';

type NotificationTemplateRow = {
  id: string;
  tenant_id: string;
  name: string;
  channel: NotificationTemplate['channel'];
  subject_template: string | null;
  body_template: string;
  created_at: Date;
  updated_at: Date;
};

export class PostgresNotificationTemplateRepository implements NotificationTemplateRepository {
  public constructor(private readonly pool: Pool) {}

  public async create(input: CreateNotificationTemplateInput): Promise<NotificationTemplate> {
    const result = await this.pool.query<NotificationTemplateRow>(
      `
        insert into notification_templates (
          tenant_id,
          name,
          channel,
          subject_template,
          body_template
        )
        values ($1, $2, $3, $4, $5)
        returning ${templateColumns}
      `,
      [input.tenantId, input.name, input.channel, input.subjectTemplate, input.bodyTemplate],
    );

    return mapTemplateRow(requireSingleRow(result.rows));
  }

  public async findByIdForTenant(
    id: string,
    tenantId: string,
  ): Promise<NotificationTemplate | null> {
    const result = await this.pool.query<NotificationTemplateRow>(
      `
        select ${templateColumns}
        from notification_templates
        where id = $1 and tenant_id = $2
      `,
      [id, tenantId],
    );

    const row = result.rows[0];
    return row ? mapTemplateRow(row) : null;
  }
}

const templateColumns = `
  id,
  tenant_id,
  name,
  channel,
  subject_template,
  body_template,
  created_at,
  updated_at
`;

function requireSingleRow<T>(rows: T[]): T {
  const row = rows[0];

  if (!row) {
    throw new Error('Expected database operation to return one row.');
  }

  return row;
}

function mapTemplateRow(row: NotificationTemplateRow): NotificationTemplate {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    name: row.name,
    channel: row.channel,
    subjectTemplate: row.subject_template,
    bodyTemplate: row.body_template,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
