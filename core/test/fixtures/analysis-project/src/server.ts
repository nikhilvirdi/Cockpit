import { routeHandler } from './routes';

const app = {
  listen: (port: number) => console.log(port),
  get: (path: string, handler: any) => handler()
};

app.get('/api', routeHandler);
app.listen(3000);
