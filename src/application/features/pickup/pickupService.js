export function createPickupService({ pickup }) {
  return {
    list: (producerId) => pickup.list(producerId),
    create: (user, input) =>
      pickup.create({
        ...input,
        producerId: user.id,
        timeZone: 'Europe/Chisinau',
      }),
  };
}
