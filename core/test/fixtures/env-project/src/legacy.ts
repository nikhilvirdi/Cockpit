export function getDynamicSetting(varName: string) {
  // Dynamic bracket access: process.env[varName]
  return process.env[varName];
}
