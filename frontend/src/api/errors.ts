export class StoryNetApiError extends Error {
  public readonly code: string;
  public readonly status?: number;
  public readonly details?: unknown;

  constructor(code: string, message: string, status?: number, details?: unknown) {
    super(message);
    this.code = code;
    this.status = status;
    this.details = details;
    this.name = "StoryNetApiError";
  }
}

export class UnauthorizedError extends StoryNetApiError {
  constructor(message = "Authentication is required.", details?: unknown) {
    super("UNAUTHORIZED", message, 401, details);
    this.name = "UnauthorizedError";
  }
}

export class ForbiddenError extends StoryNetApiError {
  constructor(message = "You are not allowed to access this resource.", details?: unknown) {
    super("FORBIDDEN", message, 403, details);
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends StoryNetApiError {
  constructor(resource: string, details?: unknown) {
    super("NOT_FOUND", `${resource} was not found.`, 404, details);
    this.name = "NotFoundError";
  }
}

export class ValidationError extends StoryNetApiError {
  constructor(message: string, details?: unknown) {
    super("VALIDATION_ERROR", message, 422, details);
    this.name = "ValidationError";
  }
}

export class ApiNotImplementedError extends StoryNetApiError {
  public readonly operation: string;

  constructor(operation: string, details?: string) {
    super(
      "NOT_IMPLEMENTED",
      details ?? `Operation '${operation}' is not yet mapped to the backend API.`
    );
    this.operation = operation;
    this.name = "ApiNotImplementedError";
  }
}