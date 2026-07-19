export class ProviderDeliveryError extends Error {
  public constructor(
    message: string,
    public readonly code: string,
    public readonly metadata: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ProviderDeliveryError';
  }
}
