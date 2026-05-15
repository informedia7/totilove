/**
 * Builds app/assets/i18n/footer-pages.json from static footer HTML files,
 * then merges hardcoded locale overlays from app/assets/i18n/footer-locale-overlays/<lang>.mjs
 * into top-level keys (vi, th, zh, fr, de, it, es, ru, ph) for simple-i18n.
 *
 * Run: node scripts/build-footer-pages-json.mjs
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const footerDir = path.join(root, 'app', 'pages', 'footer');
const overlayDir = path.join(root, 'app', 'assets', 'i18n', 'footer-locale-overlays');

const LOCALE_LANGS = ['vi', 'th', 'zh', 'fr', 'de', 'it', 'es', 'ru', 'ph'];

/** Same merge rules as SimpleI18n.deepMergeFooter (objects only). */
function deepMergeLocale(base, overlay) {
    if (!overlay || typeof overlay !== 'object') {
        return JSON.parse(JSON.stringify(base));
    }
    const out = JSON.parse(JSON.stringify(base));
    for (const k of Object.keys(overlay)) {
        const o = overlay[k];
        const b = out[k];
        if (o && typeof o === 'object' && !Array.isArray(o) && b && typeof b === 'object' && !Array.isArray(b)) {
            out[k] = deepMergeLocale(b, o);
        } else {
            out[k] = o;
        }
    }
    return out;
}

/** Inner HTML of the first <div class="className" ...> ... </div> (balanced). */
function extractDivClassInner(html, className) {
    const re = new RegExp(`<div\\s+class="${className}"[^>]*>`, 'i');
    const m = re.exec(html);
    if (!m) return '';
    const start = m.index + m[0].length;
    let i = start;
    let depth = 1;
    const len = html.length;
    while (i < len && depth > 0) {
        const open = html.indexOf('<div', i);
        const close = html.indexOf('</div>', i);
        if (close === -1) return '';
        if (open !== -1 && open < close) {
            depth++;
            i = open + 4;
        } else {
            depth--;
            if (depth === 0) {
                return html.slice(start, close).trim();
            }
            i = close + 6;
        }
    }
    return '';
}

function extractCardInner(html) {
    let inner = extractDivClassInner(html, 'fp-card-i18n');
    if (inner) return inner;
    inner = extractDivClassInner(html, 'fp-card-i18n-top');
    if (inner) return inner;
    return extractDivClassInner(html, 'fp-card');
}

function extractHeroSubtitle(html) {
    const m = html.match(/<div class="fp-hero-inner">[\s\S]*?<\/h1>\s*<p[^>]*>([\s\S]*?)<\/p>/);
    return m ? m[1].trim() : '';
}

function extractHeroTitleInner(html) {
    const m = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/);
    if (!m) return '';
    return m[1]
        .replace(/<i[^>]*><\/i>\s*/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
}

function extractMetaDescription(html) {
    const m = html.match(/<meta\s+name="description"\s+content="([^"]*)"/);
    return m ? m[1].replace(/&mdash;/g, '—').replace(/&amp;/g, '&') : '';
}

function extractTitle(html) {
    const m = html.match(/<title[^>]*>([^<]*)<\/title>/);
    return m ? m[1].trim() : '';
}

const pages = [
    'privacy',
    'terms',
    'cookies',
    'refund',
    'safety',
    'contact',
    'accessibility',
    'help',
    'sitemap',
];

const out = { en: {} };

for (const name of pages) {
    const file = path.join(footerDir, `${name}.html`);
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');
    const base = {
        metaDescription: extractMetaDescription(html),
        documentTitle: extractTitle(html),
        heroTitleHtml: extractHeroTitleInner(html),
        heroSubtitle: extractHeroSubtitle(html),
    };
    if (name === 'cookies') {
        base.cardTopHtml = extractDivClassInner(html, 'fp-card-i18n-top');
        base.cardPrefsHtml = extractDivClassInner(html, 'fp-cookie-prefs-static');
    } else {
        base.cardInnerHtml = extractCardInner(html);
    }
    out.en[name] = base;
}

const baseEn = JSON.parse(JSON.stringify(out.en));

for (const lang of LOCALE_LANGS) {
    const modPath = path.join(overlayDir, `${lang}.mjs`);
    if (!fs.existsSync(modPath)) {
        console.warn('Locale overlay missing (skipping):', modPath);
        continue;
    }
    try {
        const mod = await import(pathToFileURL(modPath).href);
        const overlay = mod.default;
        if (!overlay || typeof overlay !== 'object') {
            console.warn('Invalid default export:', modPath);
            continue;
        }
        out[lang] = deepMergeLocale(baseEn, overlay);
    } catch (e) {
        console.error('Failed to load overlay', modPath, e);
    }
}

/** Optional multi-locale module(s); fills langs not already set by per-file overlays (e.g. vi.mjs). */
const bulkParts = ['bulk-locales-eu.mjs', 'bulk-locales-asia.mjs'];
for (const part of bulkParts) {
    const bulkPath = path.join(overlayDir, part);
    if (!fs.existsSync(bulkPath)) continue;
    try {
        const bulkMod = await import(pathToFileURL(bulkPath).href);
        const bulk = bulkMod.default;
        if (!bulk || typeof bulk !== 'object') continue;
        for (const lang of Object.keys(bulk)) {
            if (lang === 'en' || !LOCALE_LANGS.includes(lang)) continue;
            if (out[lang]) continue;
            const overlay = bulk[lang];
            if (overlay && typeof overlay === 'object') {
                out[lang] = deepMergeLocale(baseEn, overlay);
            }
        }
    } catch (e) {
        console.error('Failed to load', bulkPath, e);
    }
}

const dest = path.join(root, 'app', 'assets', 'i18n', 'footer-pages.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out, null, 2), 'utf8');
console.log(
    'Wrote',
    dest,
    'locales:',
    Object.keys(out).join(', '),
    'pages:',
    Object.keys(out.en).join(', '),
);
