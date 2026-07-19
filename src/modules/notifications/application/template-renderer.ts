import { ApplicationError } from '../../../shared/errors/application-error.js';

const placeholderPattern = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.-]*)\s*\}\}/g;

export class TemplateRenderer {
  public render(template: string, variables: Record<string, unknown>): string {
    return template.replaceAll(placeholderPattern, (_match, key: string) => {
      const value = variables[key];

      if (value === undefined || value === null) {
        throw new ApplicationError({
          code: 'TEMPLATE_VARIABLE_MISSING',
          message: `Template variable "${key}" is required.`,
          statusCode: 400,
          details: { variable: key },
        });
      }

      if (typeof value === 'object') {
        return JSON.stringify(value);
      }

      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value.toString();
      }

      return JSON.stringify(value);
    });
  }
}
