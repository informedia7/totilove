/**
 * Serves footer/legal and homepage HTML already translated for the user's locale (cookie).
 * Avoids English flash on refresh — better than client-only hide-until-i18n.
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SUPPORTED = new Set(['en', 'vi', 'th', 'zh', 'fr', 'de', 'it', 'es', 'ru', 'ph']);
const FOOTER_HTML_RE = /^\/pages\/footer\/([a-z]+)\.html$/i;
const HOMEPAGE_PATHS = new Set(['/', '/pages/index.html']);
const APP_ROOT = path.join(__dirname, '../../app');
const FOOTER_BUNDLE_PATH = path.join(APP_ROOT, 'assets/i18n/footer-pages.json');
const HOMEPAGE_BUNDLE_PATH = path.join(APP_ROOT, 'assets/i18n/homepage-i18n.json');
const HOMEPAGE_HTML_PATH = path.join(APP_ROOT, 'pages/index.html');

let footerBundleCache = null;
let footerBundleMtime = 0;
let homepageBundleCache = null;
let homepageBundleMtime = 0;

function loadFooterBundle() {
    const stat = fs.statSync(FOOTER_BUNDLE_PATH);
    if (footerBundleCache && stat.mtimeMs === footerBundleMtime) {
        return footerBundleCache;
    }
    footerBundleMtime = stat.mtimeMs;
    footerBundleCache = JSON.parse(fs.readFileSync(FOOTER_BUNDLE_PATH, 'utf8'));
    return footerBundleCache;
}

function loadHomepageBundle() {
    const stat = fs.statSync(HOMEPAGE_BUNDLE_PATH);
    if (homepageBundleCache && stat.mtimeMs === homepageBundleMtime) {
        return homepageBundleCache;
    }
    homepageBundleMtime = stat.mtimeMs;
    homepageBundleCache = JSON.parse(fs.readFileSync(HOMEPAGE_BUNDLE_PATH, 'utf8'));
    return homepageBundleCache;
}

function resolveDotPath(bundle, lang, key) {
    if (!key) {
        return null;
    }
    const parts = key.split('.');
    for (const locale of [lang, 'en']) {
        let node = bundle[locale];
        if (!node) {
            continue;
        }
        for (const part of parts) {
            if (!node || typeof node !== 'object') {
                node = null;
                break;
            }
            node = node[part];
        }
        if (typeof node === 'string' && node.length) {
            return node;
        }
    }
    return null;
}

function resolveFooterString(bundle, lang, key) {
    if (!key || !key.startsWith('footerPage.')) {
        return null;
    }
    const parts = key.split('.');
    for (const locale of [lang, 'en']) {
        let node = bundle[locale];
        if (!node) {
            continue;
        }
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

function applyDataI18n(html, lang, resolveString) {
    const dom = new JSDOM(html);
    const doc = dom.window.document;

    doc.documentElement.setAttribute('lang', lang);
    doc.documentElement.setAttribute('dir', 'ltr');

    doc.querySelectorAll('[data-i18n]').forEach((el) => {
        const key = el.getAttribute('data-i18n');
        const text = resolveString(key);
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

function applyFooterLocale(html, lang) {
    const bundle = loadFooterBundle();
    return applyDataI18n(html, lang, (key) => resolveFooterString(bundle, lang, key));
}

function applyHomepageLocale(html, lang) {
    const bundle = loadHomepageBundle();
    return applyDataI18n(html, lang, (key) => resolveDotPath(bundle, lang, key));
}

function readUtf8File(filePath) {
    if (!fs.existsSync(filePath)) {
        return null;
    }
    let raw = fs.readFileSync(filePath, 'utf8');
    if (raw.charCodeAt(0) === 0xfeff) {
        raw = raw.slice(1);
    }
    return raw;
}

function readFooterHtml(pageName) {
    return readUtf8File(path.join(APP_ROOT, 'pages/footer', `${pageName}.html`));
}

function readHomepageHtml() {
    return readUtf8File(HOMEPAGE_HTML_PATH);
}

function sendLocalizedHtml(req, res, html, applyLocale) {
    const lang = (req.cookies && req.cookies.totilove_ui_lang) || '';
    if (!lang || lang === 'en' || !SUPPORTED.has(lang)) {
        return false;
    }

    try {
        const out = applyLocale(html, lang);
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.setHeader('Cache-Control', 'private, no-cache');
        res.setHeader('Vary', 'Cookie');
        if (req.method === 'HEAD') {
            res.end();
        } else {
            res.send(out);
        }
        return true;
    } catch (err) {
        console.error('[pageLocale]', req.path, err);
        return false;
    }
}

function pageLocaleMiddleware(req, res, next) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
        return next();
    }

    const reqPath = req.path || '';

    if (HOMEPAGE_PATHS.has(reqPath)) {
        if (!fs.existsSync(HOMEPAGE_BUNDLE_PATH)) {
            return next();
        }
        const html = readHomepageHtml();
        if (!html) {
            return next();
        }
        if (sendLocalizedHtml(req, res, html, applyHomepageLocale)) {
            return undefined;
        }
        return next();
    }

    const match = FOOTER_HTML_RE.exec(reqPath);
    if (!match) {
        return next();
    }

    const pageName = match[1].toLowerCase();
    const html = readFooterHtml(pageName);
    if (!html) {
        return next();
    }

    if (sendLocalizedHtml(req, res, html, applyFooterLocale)) {
        return undefined;
    }
    return next();
}

module.exports = {
    pageLocaleMiddleware,
    footerPageLocaleMiddleware: pageLocaleMiddleware,
    loadBundle: loadFooterBundle,
    applyFooterLocale,
    applyHomepageLocale
};
