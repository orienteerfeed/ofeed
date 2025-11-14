// utils/logger.js
import winston from 'winston';
import { ensureLogFolderExists } from './fileUtils.js';

// Ensure the logs folder exists
ensureLogFolderExists();

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `${timestamp} [${level}]: ${message}`;
    }),
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/app.log' }),
    new winston.transports.Console(),
  ],
});
