import { serviceA } from './serviceA';

export const serviceC = `C depends on ${serviceA}`;
