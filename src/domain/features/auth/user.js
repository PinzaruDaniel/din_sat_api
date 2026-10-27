// Always map explicitly: password hashes and private fields never leave the API.
export function toPublicUser(user) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}
