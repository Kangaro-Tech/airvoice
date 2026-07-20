import { buildApp } from "./app";

export async function startServer() {
  const app = await buildApp();

  await app.listen({
    port: Number(process.env.API_PORT ?? 3000),
    host: process.env.API_HOST ?? "0.0.0.0"
  });

  console.log("AIRVOICE API Running");
}

if (require.main === module) {
  void startServer();
}