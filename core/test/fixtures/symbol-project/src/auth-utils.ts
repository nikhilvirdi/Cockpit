export function hashPassword(raw: string): string {
  return `hashed:${raw}`;
}

export const secretKey = 'jwt-super-secret-key';

export type UserToken = {
  userId: string;
  expiresIn: number;
};
