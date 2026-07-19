export type ErrorDetails = Record<string, unknown>;

export class ApplicationError extends Error {
  public readonly code: string;
  public readonly details?: ErrorDetails;
  public readonly statusCode: number;

  public constructor(params: {
    code: string;
    message: string;
    statusCode: number;
    details?: ErrorDetails;
  }) {
    super(params.message);
    this.name = 'ApplicationError';
    this.code = params.code;
    this.details = params.details;
    this.statusCode = params.statusCode;
  }
}
