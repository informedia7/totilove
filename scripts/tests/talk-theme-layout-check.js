const fs = require('fs');
const path = require('path');

const talkPath = path.resolve(__dirname, '../../app/pages/talk.html');
const layoutPath = path.resolve(__dirname, '../../app/components/layouts/layout.html');

const talkHtml = fs.readFileSync(talkPath, 'utf8');
const layoutHtml = fs.readFileSync(layoutPath, 'utf8');

const usesLayoutInclude = /\{\{\s*(layout|extend|include:\s*layouts?)/i.test(talkHtml);
const hasStandaloneShell = /<!DOCTYPE html>/i.test(talkHtml) && /<html[\s>]/i.test(talkHtml) && /<\/html>/i.test(talkHtml);
const layoutDefinesThemeToggle = layoutHtml.includes('theme-toggle');
const talkListensForThemeEvents = /totilove:theme-change/.test(talkHtml) && /__talkThemeState/.test(talkHtml);

const issues = [];

if (!usesLayoutInclude && hasStandaloneShell && !talkListensForThemeEvents) {
    issues.push('talk.html is standalone and has no listener for the shared layout theme events.');
}

if (!layoutDefinesThemeToggle) {
    issues.push('layout.html no longer defines the theme toggle controls.');
}

if (issues.length === 0) {
    console.log('Theme integration check passed: talk page inherits layout theme controls.');
    process.exit(0);
}

console.error('Theme integration check failed:');
for (const issue of issues) {
    console.error(` - ${issue}`);
}
process.exit(1);
