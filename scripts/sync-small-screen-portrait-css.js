#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const SOURCE_FILE = path.join(PROJECT_ROOT, 'app', 'assets', 'css', 'new', '05-pages', '_talk-responsive copy 2.css');
const TARGET_FILE = path.join(PROJECT_ROOT, 'app', 'assets', 'css', 'new', '05-pages', '_talk-responsive.css');
const SMALL_SCREEN_MAX = 800; // px

function readFile(filePath) {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error(`Failed to read ${filePath}:`, error.message);
        process.exit(1);
    }
}

function writeFile(filePath, contents) {
    try {
        fs.writeFileSync(filePath, contents, 'utf8');
    } catch (error) {
        console.error(`Failed to write ${filePath}:`, error.message);
        process.exit(1);
    }
}

function normalizeHeader(header) {
    return header.replace(/\s+/g, ' ').trim().toLowerCase();
}

function shouldCopyBlock(header) {
    if (/orientation\s*:\s*portrait/i.test(header)) {
        return true;
    }

    const maxWidthMatches = [...header.matchAll(/max-width\s*:\s*(\d+)px/gi)].map((match) => parseInt(match[1], 10));
    if (maxWidthMatches.length && maxWidthMatches.some((value) => value <= SMALL_SCREEN_MAX)) {
        return true;
    }

    return false;
}

function extractMediaBlocks(css, predicate) {
    const blocks = [];
    const mediaRegex = /@media/gi;
    let match;

    while ((match = mediaRegex.exec(css)) !== null) {
        const start = match.index;
        const headerStart = start;
        const braceIndex = css.indexOf('{', headerStart);
        if (braceIndex === -1) {
            break;
        }

        const header = css.slice(headerStart, braceIndex).trim();
        let depth = 0;
        let endIndex = braceIndex;

        for (let i = braceIndex; i < css.length; i += 1) {
            const char = css[i];
            if (char === '{') {
                depth += 1;
            } else if (char === '}') {
                depth -= 1;
                if (depth === 0) {
                    endIndex = i + 1;
                    break;
                }
            }
        }

        if (depth !== 0) {
            console.warn(`Skipping malformed @media block starting near index ${start}`);
            break;
        }

        const block = css.slice(start, endIndex);
        const normalizedHeader = normalizeHeader(header);

        if (predicate(header)) {
            blocks.push({ header, normalizedHeader, block, start, endIndex });
        }

        mediaRegex.lastIndex = endIndex;
    }

    return blocks;
}

function replaceBlocks(targetCss, replacements) {
    let updatedCss = targetCss;
    const sorted = [...replacements].sort((a, b) => b.start - a.start);

    sorted.forEach(({ start, endIndex, block }) => {
        updatedCss = `${updatedCss.slice(0, start)}${block}\n\n${updatedCss.slice(endIndex)}`;
    });

    return updatedCss;
}

function syncSmallScreenPortraitCss() {
    const sourceCss = readFile(SOURCE_FILE);
    const targetCss = readFile(TARGET_FILE);

    const fallbackBlocks = extractMediaBlocks(sourceCss, shouldCopyBlock);
    if (!fallbackBlocks.length) {
        console.log('No small-screen or portrait blocks found in fallback file.');
        return;
    }

    const fallbackMap = new Map();
    fallbackBlocks.forEach((entry) => {
        fallbackMap.set(entry.normalizedHeader, entry.block.trim());
    });

    const targetBlocks = extractMediaBlocks(targetCss, (header) => fallbackMap.has(normalizeHeader(header)));

    let updatedCss = targetCss;
    let replacedCount = 0;

    if (targetBlocks.length) {
        const replacements = targetBlocks.map((entry) => ({
            start: entry.start,
            endIndex: entry.endIndex,
            block: fallbackMap.get(entry.normalizedHeader),
        }));

        updatedCss = replaceBlocks(updatedCss, replacements);
        replacedCount = replacements.length;
    }

    const existingHeaders = new Set(targetBlocks.map((entry) => entry.normalizedHeader));
    const missingBlocks = fallbackBlocks.filter((entry) => !existingHeaders.has(entry.normalizedHeader));

    if (missingBlocks.length) {
        const insertion = `\n\n${missingBlocks.map((entry) => `${entry.block.trim()}\n`).join('\n')}`;
        const printMarker = updatedCss.indexOf('/* PRINT STYLES');
        if (printMarker !== -1) {
            updatedCss = `${updatedCss.slice(0, printMarker)}${insertion}\n${updatedCss.slice(printMarker)}`;
        } else {
            updatedCss = `${updatedCss.trimEnd()}${insertion}\n`;
        }
    }

    if (updatedCss !== targetCss) {
        writeFile(TARGET_FILE, updatedCss);
        console.log(`Synced portrait/small-screen CSS. Replaced ${replacedCount} block(s) and added ${missingBlocks.length} new block(s).`);
    } else {
        console.log('Target CSS already up to date.');
    }
}

syncSmallScreenPortraitCss();
