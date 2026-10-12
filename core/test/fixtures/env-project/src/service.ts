import { config } from './config';

export function checkService() {
  const url = config.dbUrl;
  console.log(`Service checking db at ${url}`);
}
