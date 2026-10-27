export class AppError extends Error {
  constructor(status, code, message, fieldErrors) {
    super(message);
    Object.assign(this, { status, code, fieldErrors });
  }
}
