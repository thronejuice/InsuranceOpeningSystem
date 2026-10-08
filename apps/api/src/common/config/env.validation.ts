import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  API_PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().uri().required(),
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_ACCESS_TTL_SECONDS: Joi.number().integer().positive().default(900),
  JWT_REFRESH_TTL_DAYS: Joi.number().integer().positive().default(7),
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().port().default(6379),
  // CORS: comma-separated list of allowed origins (defaults to local dev)
  CORS_ORIGINS: Joi.string().default('http://localhost:4200'),
  // Storage: 'local' (default) or 's3' (MinIO-compatible)
  STORAGE_DRIVER: Joi.string().valid('local', 's3').default('local'),
  /* eslint-disable unicorn/no-thenable */
  S3_ENDPOINT: Joi.string().uri().when('STORAGE_DRIVER', { is: 's3', then: Joi.required() }),
  S3_BUCKET: Joi.string().when('STORAGE_DRIVER', { is: 's3', then: Joi.required() }),
  S3_ACCESS_KEY: Joi.string().when('STORAGE_DRIVER', { is: 's3', then: Joi.required() }),
  S3_SECRET_KEY: Joi.string().when('STORAGE_DRIVER', { is: 's3', then: Joi.required() }),
  /* eslint-enable unicorn/no-thenable */
  S3_REGION: Joi.string().default('us-east-1'),
  UPLOAD_DIR: Joi.string().default('./uploads'),
  // PDF rendering: path to a system Chromium (e.g. /usr/bin/chromium-browser in Docker); empty = Puppeteer's bundled browser
  PUPPETEER_EXECUTABLE_PATH: Joi.string().optional(),
});
