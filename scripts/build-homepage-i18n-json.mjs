/**
 * Builds app/assets/i18n/homepage-i18n.json from embedded translations in simple-i18n.js
 * (app, hero, footer, cta keys used on index.html).
 *
 * Run: node scripts/build-homepage-i18n-json.mjs
 */
import fs from 'fs';
import path from 'path';
import vm from 'vm';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const simpleI18nPath = path.join(root, 'app', 'assets', 'i18n', 'simple-i18n.js');
const outPath = path.join(root, 'app', 'assets', 'i18n', 'homepage-i18n.json');

const HOME_TOP_KEYS = ['app', 'hero', 'footer', 'cta'];

function extractTranslationsObject(src) {
    const marker = 'const translations = ';
    const idx = src.indexOf(marker);
    if (idx === -1) {
        throw new Error('const translations = { ... } not found in simple-i18n.js');
    }
    const braceStart = src.indexOf('{', idx);
    let depth = 0;
    for (let i = braceStart; i < src.length; i++) {
        if (src[i] === '{') {
            depth++;
        } else if (src[i] === '}') {
            depth--;
            if (depth === 0) {
                const objStr = src.slice(braceStart, i + 1);
                return vm.runInNewContext(`(${objStr})`, Object.create(null), { timeout: 10000 });
            }
        }
    }
    throw new Error('Unbalanced braces in translations object');
}

function pickHomepageKeys(translations) {
    const out = {};
    for (const lang of Object.keys(translations)) {
        const src = translations[lang];
        if (!src || typeof src !== 'object') {
            continue;
        }
        const picked = {};
        for (const key of HOME_TOP_KEYS) {
            if (src[key] !== undefined) {
                picked[key] = src[key];
            }
        }
        if (Object.keys(picked).length) {
            out[lang] = picked;
        }
    }
    return out;
}

const src = fs.readFileSync(simpleI18nPath, 'utf8');
const translations = extractTranslationsObject(src);
const bundle = pickHomepageKeys(translations);

if (!bundle.en) {
    throw new Error('English homepage strings missing from simple-i18n.js');
}

fs.writeFileSync(outPath, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
console.log(`Wrote ${outPath} (${Object.keys(bundle).length} locales)`);
