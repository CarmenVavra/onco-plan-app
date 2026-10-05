/**
 * Fachlicher Fehler mit HTTP-Status und nutzerverständlicher Nachricht.
 * Nur AppError-Nachrichten erreichen den Client – alles andere wird generisch beantwortet.
 */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly publicMessage: string,
    public readonly code: string = 'APP_ERROR',
  ) {
    super(publicMessage);
    this.name = 'AppError';
  }

  static badRequest(message = 'Ungültige Anfrage.'): AppError {
    return new AppError(400, message, 'BAD_REQUEST');
  }
  static unauthorized(message = 'Bitte melden Sie sich an.'): AppError {
    return new AppError(401, message, 'UNAUTHORIZED');
  }
  static forbidden(message = 'Keine Berechtigung für diese Aktion.'): AppError {
    return new AppError(403, message, 'FORBIDDEN');
  }
  static notFound(message = 'Nicht gefunden.'): AppError {
    return new AppError(404, message, 'NOT_FOUND');
  }
  static conflict(message = 'Der Datensatz existiert bereits.'): AppError {
    return new AppError(409, message, 'CONFLICT');
  }
}
