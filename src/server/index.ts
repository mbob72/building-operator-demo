import { buildApp } from './app.js';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
const app = buildApp();

const close = async () => {
  await app.close();
  process.exit(0);
};

process.on('SIGINT', close);
process.on('SIGTERM', close);

try {
  await app.listen({ port, host });
  console.log(`Scene API listening at http://${host}:${port}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
