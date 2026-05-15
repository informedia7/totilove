import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Load full privacy card inner HTML for a locale (build-time only). */
export function readPrivacyHtml(lang) {
    return fs.readFileSync(path.join(__dirname, `${lang}.html`), 'utf8').trim();
}
