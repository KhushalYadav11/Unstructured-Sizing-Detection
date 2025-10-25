export class APIError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string
  ) {
    super(message);
    this.name = 'APIError';
  }

  static async fromResponse(response: Response): Promise<APIError> {
    const status = response.status;
    try {
      const data = await response.json();
      return new APIError(
        data.message || response.statusText,
        status,
        data.code
      );
    } catch {
      return new APIError(response.statusText, status);
    }
  }

  get isUnauthorized() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isNotFound() {
    return this.status === 404;
  }

  get isValidation() {
    return this.status === 422;
  }

  get isServer() {
    return this.status >= 500;
  }
}