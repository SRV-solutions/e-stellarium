export class HttpError extends Error {
  status: number;
  details?: Record<string, unknown>; // datos extra que van en la respuesta, junto al mensaje

  constructor(status: number, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.details = details;
  }
}
