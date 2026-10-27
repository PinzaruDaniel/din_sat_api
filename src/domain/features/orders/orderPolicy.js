import { AppError } from '../../../shared/errors/AppError.js';
const transitions = {
  new: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready'],
  ready: ['completed'],
  completed: [],
  cancelled: [],
};
export function assertOrderTransition(order, user, next) {
  const isProducer = user.role === 'producer' && order.producerId === user.id;
  const isBuyer = order.buyerId === user.id;
  if (!isProducer && !isBuyer)
    throw new AppError(403, 'FORBIDDEN', 'Nu ai acces la această comandă.');
  if (!isProducer && next !== 'cancelled')
    throw new AppError(
      403,
      'FORBIDDEN',
      'Doar producătorul poate actualiza pregătirea.',
    );
  if (!transitions[order.status].includes(next))
    throw new AppError(
      409,
      'INVALID_TRANSITION',
      'Statusul comenzii nu mai permite această schimbare.',
    );
}
