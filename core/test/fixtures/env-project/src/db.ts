import { dbUrl } from './config';

export function connectDb() {
  console.log(`Connecting to database at ${dbUrl}`);
}
