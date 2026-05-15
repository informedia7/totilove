import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Cookie page intro block (build-time). */
export function readCookieTopHtml(lang) {
    return fs.readFileSync(path.join(__dirname, `${lang}-top.html`), 'utf8').trim();
}

/** Cookie preference UI block; keep input ids for footer script (build-time). */
export function readCookiePrefsHtml(lang) {
    return fs.readFileSync(path.join(__dirname, `${lang}-prefs.html`), 'utf8').trim();
}
