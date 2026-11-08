import { createApp } from './createApp.js';
import { loadConfig } from './config/loadConfig.js';
import { createRuntime } from './container/createRuntime.js';

const config = loadConfig();
const runtime = await createRuntime(config);
const app = createApp({ ...runtime, config });
const server = app.listen(config.port, config.host, () => {
  console.info(
    `DinSat API listening on port ${config.port} (${config.demo ? 'demo: volatile data' : 'PostgreSQL: persistent data'}).`,
  );
});
server.on('error', async () => {
  console.error('API could not listen on the configured interface and port.');
  await runtime.close();
  process.exitCode = 1;
});
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    server.close(async () => {
      try {
        await runtime.close();
      } finally {
        clearTimeout(deadline);
      }
    });
  });
}
