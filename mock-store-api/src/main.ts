import { ValidationPipe } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AppModule } from "./app.module";

function loadLocalEnvFile(): void {
  const envPath = resolve(__dirname, "..", ".env");
  if (!existsSync(envPath)) {
    return;
  }

  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    const rawValue = line.slice(separatorIndex + 1).trim();
    const value = rawValue.replace(/^['\"]|['\"]$/g, "");
    process.env[key] = value;
  }
}

loadLocalEnvFile();

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });

  const configuredOrigins = (process.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);

  const localhostOriginPattern =
    /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i;

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (
        configuredOrigins.includes(origin) ||
        configuredOrigins.length === 0 ||
        localhostOriginPattern.test(origin)
      ) {
        callback(null, true);
        return;
      }

      callback(null, false);
    },
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: "*",
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = Number(process.env.PORT ?? "4000");
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Mock Store API running on http://localhost:${port}`);
}

void bootstrap();
