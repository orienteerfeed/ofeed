// utils/fileUtils.js
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const ensureLogFolderExists = async () => {
  const logDir = path.join(__dirname, '../../logs');
  try {
    await fs.mkdir(logDir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') {
      throw err;
    }
  }
};
