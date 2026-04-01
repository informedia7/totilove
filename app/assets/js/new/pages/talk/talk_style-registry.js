(function (window) {
    'use strict';

    const STATUS_THEMES = {
        online: {
            dot: '#12b886',
            highlight: '#37ef8d',
            low: '#0f9d58',
            glow: 'rgba(15, 157, 88, 0.55)',
            text: '#27ae60',
            border: 'rgba(255, 255, 255, 0.6)'
        },
        offline: {
            dot: '#6c757d',
            highlight: '#adb5bd',
            low: '#495057',
            glow: 'rgba(73, 80, 87, 0.35)',
            text: '#6c757d',
            border: 'rgba(255, 255, 255, 0.25)'
        },
        busy: {
            dot: '#f08c00',
            highlight: '#ffd43b',
            low: '#d9480f',
            glow: 'rgba(240, 140, 0, 0.45)',
            text: '#f08c00',
            border: 'rgba(255, 255, 255, 0.35)'
        },
        'in-call': {
            dot: '#4263eb',
            highlight: '#74c0fc',
            low: '#364fc7',
            glow: 'rgba(66, 99, 235, 0.4)',
            text: '#4263eb',
            border: 'rgba(255, 255, 255, 0.35)'
        }
    };

    STATUS_THEMES['in_call'] = STATUS_THEMES['in-call'];

    const FILTER_THEMES = {
        sender: {
            default: {
                bg: '#ffffff',
                border: '#e9ecef',
                text: '#495057',
                shadow: 'none',
                hoverBg: '#f8f9fa',
                hoverBorder: '#007bff'
            },
            me: {
                bg: '#e3f2fd',
                border: '#3b82f6',
                text: '#0d47a1',
                shadow: '0 0 0 2px rgba(59, 130, 246, 0.25)',
                hoverBg: '#d7e9ff',
                hoverBorder: '#1d4ed8'
            },
            partner: {
                bg: '#f7ecff',
                border: '#c084fc',
                text: '#6b21a8',
                shadow: '0 0 0 2px rgba(192, 132, 252, 0.3)',
                hoverBg: '#f1dbff',
                hoverBorder: '#a855f7'
            }
        },
        time: {
            default: {
                bg: '#ffffff',
                border: '#e9ecef',
                text: '#495057',
                shadow: 'none',
                hoverBg: '#fdf5e6',
                hoverBorder: '#ffc107'
            },
            range: {
                bg: '#fff3cd',
                border: '#ffb703',
                text: '#7c4a03',
                shadow: '0 0 0 2px rgba(255, 193, 7, 0.25)',
                hoverBg: '#ffe8a1',
                hoverBorder: '#f59f00'
            }
        }
    };

    function normalizeStatus(status) {
        if (!status && status !== 0) {
            return 'offline';
        }
        if (typeof status === 'boolean') {
            return status ? 'online' : 'offline';
        }
        return String(status)
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/_/g, '-') || 'offline';
    }

    function setCustomProperties(target, props) {
        if (!target || !props) {
            return;
        }
        const style = target.style;
        Object.entries(props).forEach(([key, value]) => {
            if (value === undefined || value === null || value === '') {
                style.removeProperty(key);
            } else {
                style.setProperty(key, String(value));
            }
        });
    }

    function applyStatusColors(target, status, options = {}) {
        if (!target) {
            return null;
        }
        const normalized = normalizeStatus(status);
        const fallback = normalizeStatus(options.fallback || 'offline');
        const theme = STATUS_THEMES[normalized] || STATUS_THEMES[fallback] || STATUS_THEMES.offline;
        if (!theme) {
            return null;
        }

        setCustomProperties(target, {
            '--talk-presence-dot-color': theme.dot,
            '--talk-presence-dot-highlight': theme.highlight,
            '--talk-presence-dot-low': theme.low,
            '--talk-presence-dot-shadow': theme.glow,
            '--talk-status-text-color': options.textColor || theme.text,
            '--talk-status-border-color': theme.border
        });

        if (options.applyDataset !== false) {
            target.dataset.talkStatus = normalized;
        }

        return theme;
    }

    function applyTypingState(target, intensity = 1) {
        if (!target) {
            return;
        }
        const safeIntensity = Math.max(0, Math.min(1, Number(intensity) || 0));
        const opacity = (0.4 + (safeIntensity * 0.5)).toFixed(2);
        const scale = (0.95 + (safeIntensity * 0.05)).toFixed(2);
        setCustomProperties(target, {
            '--talk-typing-opacity': opacity,
            '--talk-typing-scale': scale
        });
    }

    function applyFilterTheme(target, options = {}) {
        if (!target) {
            return null;
        }
        const variant = (options.variant || 'sender').toLowerCase();
        const mode = (options.mode || 'default').toLowerCase();
        const palette = FILTER_THEMES[variant] || FILTER_THEMES.sender;
        const theme = palette[mode] || palette.default;
        if (!theme) {
            return null;
        }

        setCustomProperties(target, {
            '--talk-filter-bg': theme.bg,
            '--talk-filter-border': theme.border,
            '--talk-filter-text': theme.text,
            '--talk-filter-shadow': theme.shadow,
            '--talk-filter-hover-bg': theme.hoverBg,
            '--talk-filter-hover-border': theme.hoverBorder
        });

        if (options.applyDataset !== false) {
            target.dataset.talkFilterVariant = variant;
            target.dataset.talkFilterMode = mode;
        }

        return theme;
    }

    window.TalkStyleRegistry = {
        applyStatusColors,
        applyTypingState,
        applyFilterTheme,
        setCustomProperties
    };
})(window);
