import dotenv from "dotenv";
import { resolve } from "node:path";
import { createApp } from "./app.js";
import { connectDatastores } from "./services/db.js";
import { startAiWorker } from "./workers/aiWorker.js";
import { startUnlockWorker } from "./workers/unlockWorker.js";

dotenv.config({ path: resolve(process.cwd(), "../../.env") });
dotenv.config();
const app = createApp();

const port = Number(process.env.API_PORT || 4000);

async function bootstrap() {
  await connectDatastores();
  startAiWorker();
  startUnlockWorker();

  app.listen(port, () => {
    console.log(`SoulSafe API listening on port ${port}`);
  });
}

bootstrap().catch((error) => {
  console.error("Failed to start SoulSafe API", error);
  process.exit(1);
});
