import cors from "cors";
import express from "express";
import aiRoutes from "./routes/ai.js";
import authRoutes from "./routes/auth.js";
import capsuleRoutes from "./routes/capsules.js";

export function createApp() {
  const app = express();
  const bodyLimit = process.env.API_BODY_LIMIT ?? "10mb";

  app.use(cors());
  app.use(express.json({ limit: bodyLimit }));
  app.use(express.urlencoded({ extended: true, limit: bodyLimit }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "api-node" });
  });

  app.use("/auth", authRoutes);
  app.use("/ai", aiRoutes);
  app.use("/capsules", capsuleRoutes);

  app.use((err: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
    const payloadTooLarge = typeof err === "object" && err !== null && "type" in err
      && (err as { type?: string }).type === "entity.too.large";

    if (payloadTooLarge) {
      return res.status(413).json({
        error: "payload_too_large",
        message: `Request body exceeds the configured limit (${bodyLimit}).`
      });
    }

    return next(err);
  });

  return app;
}
