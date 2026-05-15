/**
 * Serves footer/legal HTML already translated for the user's locale (cookie).
 * Avoids English flash on refresh — better than client-only hide-until-i18n.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SUPPORTED = new Set(['en', 'vi', 'th', 'zh', 'fr', 'de', 'it', 'es', 'ru', 'ph']);
const FOOTER_HTML_RE = /^\/pages\/footer\/([a-z]+)\.html$/i;
const APP_ROOT = path.join(__dirname, '../../app');
const BUNDLE_PATH = path.join(APP_ROOT, 'assets/i18n/footer-pages.json');

let bundleCache = null;
let bundleMtime = 0;

function loadBundle() {
    const stat = fs.statSync(BUNDLE_PATH);
    if (bundleCache && stat.mtimeMs === bundleMtime) {
        return bundleCache;
    }
    bundleMtime = stat.mtimeMs;
    bundleCache = JSON.parse(fs.readFileSync(BUNDLE_PATH, 'utf8'));
    return bundleCache;
}

function resolveFooterString(bundle, lang, key) {
    if (!key || !key.startsWith('footerPage.')) {
        return null;
    }
    const parts = key.split('.');
    const locales = [lang, 'en'];
    for (const locale of locales) {
        let node = bundle[locale];
        if (!node) continue;
        for (let i = 1; i < parts.length; i++) {
            if (!node || typeof node !== 'object') {
                node = null;
                break;
            }
            node = node[parts[i]];
        }
        if (typeof node === 'string' && node.length) {
            return node;
        }
    }
    return null;
}

function applyFooterLocale(html, lang) {
    const bundle = loadBundle();
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    doc.documentElement.setAttribute('lang', lang);
    doc.documentElement.setAttribute('dir', 'ltr');

    doc.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        const text = resolveFooterString(bundle, lang, key);
        if (!text || text === key) {
            return;
        }

        const tag = el.tagName;
        if (tag === 'META') {
            el.setAttribute('content', text);
            return;
        }
        if (tag === 'TITLE') {
            el.textContent = text;
            return;
        }
        if (el.hasAttribute('data-i18n-html')) {
            el.innerHTML = text;
            return;
        }
        if (tag === 'INPUT' && el.getAttribute('type') === 'text') {
            el.setAttribute('placeholder', text);
            return;
        }
        if (tag === 'TEXTAREA') {
            el.setAttribute('placeholder', text);
            return;
        }
        el.textContent = text;
    });

    return dom.serialize();
}

function readFooterHtml(pageName) {
    const filePath = path.join(APP_ROOT, 'pages/footer', `${pageName}.html`);
    if (!fs.existsSync(filePath)) {
        return null;
    }
    let raw = fs.readFileSync(filePath, 'utf8');
    if (raw.charCodeAt(0) === 0xfeff) {
        raw = raw.slice(1);
    }
    return raw;
}

function footerPageLocaleMiddleware(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return next();
    }

    const match = FOOTER_HTML_RE.exec(req.path || '');
    if (!match) {
        return next();
    }

    const lang = (req.cookies && req.cookies.totilove_ui_lang) || '';
    if (!lang || lang === 'en' || !SUPPORTED.has(lang)) {
        return next();
    }

    const pageName = match[1].toLowerCase();
    const html = readFooterHtml(pageName);
    if (!html) {
        return next();
    }

    try {
        const out = applyFooterLocale(html, lang);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'private, no-cache');
        res.setHeader('Vary', 'Cookie');
        if (req.method === 'HEAD') {
            return res.end();
        }
        return res.send(out);
    } catch (err) {
        console.error('[footerPageLocale]', req.path, err);
        return next();
    }
}

module.exports = { footerPageLocaleMiddleware, loadBundle, applyFooterLocale };
