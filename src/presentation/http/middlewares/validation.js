import { AppError } from '../../../shared/errors/AppError.js';
export function validate(schema, source = 'body') {
  return (req, _res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const fields = {};
      for (const issue of result.error.issues)
        fields[issue.path.join('.')] = issue.message;
      throw new AppError(
        400,
        'VALIDATION_ERROR',
        'Verifică datele introduse.',
        fields,
      );
    }
    req.validated = result.data;
    next();
  };
}
