// Exported config object consuming DATABASE_URL and re-exported const
export const dbUrl = process.env.DATABASE_URL;

export const config = {
  dbUrl: process.env.DATABASE_URL,
  port: process.env.PORT
};

export function getDatabaseUrl(): string | undefined {
  return process.env.DATABASE_URL;
}
