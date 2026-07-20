import { describe, expect, it } from 'vitest';

import { TemplateRenderer } from '@modules/notifications/application/template-renderer.js';
import { ApplicationError } from '@shared/errors/application-error.js';

describe('TemplateRenderer', () => {
  it('replaces placeholders with stringified variable values', () => {
    const renderer = new TemplateRenderer();

    expect(
      renderer.render('Hello {{name}}, order {{orderId}} is {{status}}.', {
        name: 'Vishnu',
        orderId: 42,
        status: 'ready',
      }),
    ).toBe('Hello Vishnu, order 42 is ready.');
  });

  it('rejects templates with missing variables', () => {
    const renderer = new TemplateRenderer();

    expect(() => renderer.render('Hello {{name}}', {})).toThrow(ApplicationError);
  });
});
