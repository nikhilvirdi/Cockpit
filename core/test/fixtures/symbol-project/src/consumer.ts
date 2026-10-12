import { hashPassword, secretKey } from './auth-utils';
import type { UserToken } from './auth-utils';

// 1. Module top-level (no enclosing function) -> "<module>"
export const initialSecret = secretKey;

// 2. Inside a named function -> "handleLogin"
export function handleLogin(password: string): string {
  return hashPassword(password);
}

// 3. Inside an anonymous arrow assigned to a const -> "handleAuth"
export const handleAuth = (pwd: string): string => {
  return hashPassword(pwd);
};

// 4. import type usage inside a function -> "verifyUser", typeOnly: true
export function verifyUser(token: UserToken): boolean {
  return Boolean(token.userId);
}

// 5. Inside a class method -> "AuthService.login"
export class AuthService {
  login(pwd: string): string {
    return hashPassword(pwd);
  }
}
