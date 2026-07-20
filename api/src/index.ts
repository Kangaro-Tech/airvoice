import { buildApp } from './app';
import { startServer } from './server';

let app: any;

export async function handler(req: any, res: any) {
  try {
    if (!app) {
      app = await buildApp();
      await app.ready();
    }

    app.server.emit('request', req, res);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.statusCode = 500;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ error: 'Internal Server Error', message }));
  }
}

export default handler;
module.exports = handler;

if (require.main === module && process.env.VERCEL !== '1') {
  void startServer();
}