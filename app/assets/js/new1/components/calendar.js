/* ===============================
    CALENDAR.JS - FINAL PRODUCTION VERSION
    =============================== */

class Calendar {
    constructor(options = {}) {
        // Bind default formatters so they can be used as callbacks safely
        this.defaultFormatDate = this.defaultFormatDate.bind(this);
        this.defaultFormatTime = this.defaultFormatTime.bind(this);

        // Core options with safe fallbacks
        this.options = {
            container: options.container || document.body,
            date: options.date || new Date(),
            startDay: options.startDay ?? 0,
            locale: options.locale || 'en-US',
            darkMode: options.darkMode || false,
            showEvents: options.showEvents !== false,
            events: Array.isArray(options.events) ? options.events : [],
            formatDate: options.formatDate,
            formatTime: options.formatTime,
            onDateSelect: options.onDateSelect || null,
            onMonthChange: options.onMonthChange || null,
            onViewChange: options.onViewChange || null,
            onEventClick: options.onEventClick || null,
            onEventAdd: options.onEventAdd || null,
            onEventUpdate: options.onEventUpdate || null,
            onEventRemove: options.onEventRemove || null,
            minDate: options.minDate || null,
            maxDate: options.maxDate || null
        };

        // Ensure overrides are optional and defaults are always available
        this.options.formatDate ??= this.defaultFormatDate;
        this.options.formatTime ??= this.defaultFormatTime;

        // State
        this.currentDate = new Date(this.options.date);
        this.selectedDate = new Date(this.options.date);
        this.events = [...this.options.events].map(event => ({
            ...event,
            date: new Date(event.date || new Date()),
            startTime: new Date(event.startTime || event.date || new Date()),
            endTime: new Date(event.endTime || event.startTime || event.date || new Date())
        }));
        this.view = 'month';
        this.minDate = this.normalizeDateInput(this.options.minDate);
        this.maxDate = this.normalizeDateInput(this.options.maxDate);
        this.currentDate = this.clampDate(this.currentDate) || new Date();
        this.selectedDate = this.clampDate(this.selectedDate) || new Date();

        // DOM references
        this.container = null;

        // Bound handlers
        this.boundClick = this.handleClick.bind(this);
        this.boundKeydown = this.handleKeydown.bind(this);
        this.boundDocumentKeydown = this.handleDocumentKeydown.bind(this);

        this.init();
    }

    /* ===============================
       FORMATTERS
       =============================== */

    defaultFormatDate(date, format = 'medium', locale = 'en-US') {
        switch (format) {
            case 'short':
                return date.toLocaleDateString(locale);
            case 'long':
                return date.toLocaleDateString(locale, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            case 'monthYear':
                return date.toLocaleDateString(locale, {
                    month: 'long',
                    year: 'numeric'
                });
            case 'weekdayShort':
                return date.toLocaleDateString(locale, { weekday: 'short' });
            case 'weekdayLong':
                return date.toLocaleDateString(locale, { weekday: 'long' });
            case 'full':
                return date.toLocaleDateString(locale, {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
            case 'medium':
                return date.toLocaleDateString(locale, {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            default:
                return date.toLocaleDateString(locale);
        }
    }

    defaultFormatTime(date, locale = 'en-US') {
        return date.toLocaleTimeString(locale, {
            hour: '2-digit',
            minute: '2-digit'
        });
    }

    /* ===============================
       DATE UTILITIES (TZ SAFE)
       =============================== */

    toDateKey(date) {
        return date.toLocaleDateString('en-CA');
    }

    isSameDay(a, b) {
        return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    }

    isToday(date) {
        const today = new Date();
        return this.isSameDay(date, today);
    }

    normalizeDateInput(input) {
        if (!input) return null;
        const date = input instanceof Date ? new Date(input) : new Date(input);
        if (Number.isNaN(date.getTime())) return null;
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    clampDate(date) {
        const normalized = this.normalizeDateInput(date);
        if (!normalized) return null;
        if (this.minDate && normalized.getTime() < this.minDate.getTime()) {
            return new Date(this.minDate);
        }
        if (this.maxDate && normalized.getTime() > this.maxDate.getTime()) {
            return new Date(this.maxDate);
        }
        return normalized;
    }

    isWithinBounds(date) {
        if (!(date instanceof Date)) return true;
        const time = date.getTime();
        if (this.minDate && time < this.minDate.getTime()) return false;
        if (this.maxDate && time > this.maxDate.getTime()) return false;
        return true;
    }

    getMonthStart(date) {
        const normalized = this.normalizeDateInput(date);
        if (!normalized) return null;
        return new Date(normalized.getFullYear(), normalized.getMonth(), 1);
    }

    getMonthStartValue(date) {
        const start = this.getMonthStart(date);
        return start ? start.getTime() : null;
    }

    isAtMinMonth() {
        if (!this.minDate) return false;
        const current = this.getMonthStartValue(this.currentDate);
        const min = this.getMonthStartValue(this.minDate);
        return current !== null && min !== null && current <= min;
    }

    isAtMaxMonth() {
        if (!this.maxDate) return false;
        const current = this.getMonthStartValue(this.currentDate);
        const max = this.getMonthStartValue(this.maxDate);
        return current !== null && max !== null && current >= max;
    }

    isAtMinYear() {
        if (!this.minDate) return false;
        return this.currentDate.getFullYear() <= this.minDate.getFullYear();
    }

    isAtMaxYear() {
        if (!this.maxDate) return false;
        return this.currentDate.getFullYear() >= this.maxDate.getFullYear();
    }

    /* ===============================
       EVENTS
       =============================== */

    getEventsForDate(date) {
        const key = this.toDateKey(date);
        return this.events.filter(event => this.toDateKey(new Date(event.date)) === key);
    }

    getEventsForDateSorted(date) {
        return this.getEventsForDate(date).sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    }

    /* ===============================
       INIT / DESTROY
       =============================== */

    init() {
        Calendar.injectCSS();
        this.createCalendar();
        this.render();
        this.attachEvents();
        this.observeDarkMode();
    }

    destroy() {
        if (!this.container) return;
        this.container.removeEventListener('click', this.boundClick);
        this.container.removeEventListener('keydown', this.boundKeydown);
        document.removeEventListener('keydown', this.boundDocumentKeydown);
        this.darkModeObserver?.disconnect();
        this.container.remove();
        this.container = null;
    }

    /* ===============================
       DOM
       =============================== */

    createCalendar() {
        if (typeof this.options.container === 'string') {
            const target = document.querySelector(this.options.container);
            if (target) {
                this.options.container = target;
            } else {
                this.options.container = document.body;
            }
        }

        this.container = document.createElement('div');
        this.container.className = 'calendar';
        this.container.tabIndex = 0;
        if (this.options.darkMode) {
            this.container.classList.add('dark-mode');
        }

        this.options.container.appendChild(this.container);
    }

    attachEvents() {
        this.container.addEventListener('click', this.boundClick);
        this.container.addEventListener('keydown', this.boundKeydown);
        document.addEventListener('keydown', this.boundDocumentKeydown);
    }

    observeDarkMode() {
        const body = document.body;
        if (!body) return;

        this.darkModeObserver = new MutationObserver(() => {
            const isDark = body.classList.contains('dark-mode');
            this.container.classList.toggle('dark-mode', isDark);
        });
        this.darkModeObserver.observe(body, { attributes: true, attributeFilter: ['class'] });
    }

    /* ===============================
       RENDER
       =============================== */

    render() {
        if (!this.container) return;

        if (this.view === 'year') {
            this.renderYearView();
            return;
        }
        this.renderMonthView();
    }

    /* ===============================
       MONTH VIEW
       =============================== */

    renderMonthView() {
        const title = this.options.formatDate(this.currentDate, 'monthYear', this.options.locale);
        const disablePrevMonth = this.isAtMinMonth();
        const disableNextMonth = this.isAtMaxMonth();
        this.container.innerHTML = `
            <div class="calendar-header">
                <button class="calendar-nav-btn prev-month" aria-label="Previous month" ${disablePrevMonth ? 'disabled aria-disabled="true"' : ''}>&lsaquo;</button>
                <div class="calendar-title">${title}</div>
                <button class="calendar-nav-btn next-month" aria-label="Next month" ${disableNextMonth ? 'disabled aria-disabled="true"' : ''}>&rsaquo;</button>
            </div>
            <div class="calendar-weekdays">
                ${this.getWeekDays().map(day => `<div>${day.short}</div>`).join('')}
            </div>
            <div class="calendar-days">
                ${this.generateMonthGrid().map(day => this.renderDay(day)).join('')}
            </div>
            ${this.options.showEvents ? this.renderEvents() : ''}
            ${this.renderFooter()}
        `;
    }

    renderYearView() {
        const disablePrevYear = this.isAtMinYear();
        const disableNextYear = this.isAtMaxYear();
        this.container.innerHTML = `
            <div class="calendar-header">
                <button class="calendar-nav-btn prev-year" aria-label="Previous year" ${disablePrevYear ? 'disabled aria-disabled="true"' : ''}>&lsaquo;</button>
                <div class="calendar-title">${this.currentDate.getFullYear()}</div>
                <button class="calendar-nav-btn next-year" aria-label="Next year" ${disableNextYear ? 'disabled aria-disabled="true"' : ''}>&rsaquo;</button>
            </div>
            <div class="calendar-year-view">Year view pending</div>
            ${this.renderFooter()}
        `;
    }

    /* ===============================
       FOOTER / DAYS
       =============================== */

    renderFooter() {
        const today = this.clampDate(new Date());
        const isTodayActive = Boolean(today && this.selectedDate && this.isSameDay(this.selectedDate, today));
        const isYearActive = this.view === 'year';
        return `
            <div class="calendar-footer">
                <button class="calendar-today-btn ${isTodayActive ? 'active' : ''}">Today</button>
                <button class="calendar-view-btn ${isYearActive ? 'active' : ''}" data-view="year">Year</button>
            </div>
        `;
    }

    getWeekDays() {
        return Array.from({ length: 7 }, (_, index) => {
            const day = (this.options.startDay + index) % 7;
            const reference = new Date(2024, 0, day + 1);
            return {
                full: this.options.formatDate(reference, 'weekdayLong', this.options.locale),
                short: this.options.formatDate(reference, 'weekdayShort', this.options.locale)
            };
        });
    }

    generateMonthGrid() {
        const year = this.currentDate.getFullYear();
        const month = this.currentDate.getMonth();
        const firstOfMonth = new Date(year, month, 1);
        const startOffset = (firstOfMonth.getDay() - this.options.startDay + 7) % 7;
        const days = [];

        for (let i = startOffset; i > 0; i -= 1) {
            days.push({ date: new Date(year, month, 1 - i), isCurrentMonth: false });
        }

        const daysInMonth = new Date(year, month + 1, 0).getDate();
        for (let day = 1; day <= daysInMonth; day += 1) {
            days.push({ date: new Date(year, month, day), isCurrentMonth: true });
        }

        while (days.length < 42) {
            const last = days[days.length - 1].date;
            const next = new Date(last);
            next.setDate(last.getDate() + 1);
            days.push({ date: next, isCurrentMonth: false });
        }

        return days;
    }

    renderDay({ date, isCurrentMonth }) {
        const classes = ['calendar-day'];
        if (!isCurrentMonth) classes.push('disabled');
        if (this.isToday(date)) classes.push('today');
        if (this.isSameDay(date, this.selectedDate)) classes.push('selected');
        if (this.getEventsForDate(date).length) classes.push('has-event');

        const maxTime = this.maxDate?.getTime() ?? null;
        const minTime = this.minDate?.getTime() ?? null;
        const isFutureDisabled = Boolean(maxTime && date.getTime() > maxTime);
        const isPastDisabled = Boolean(minTime && date.getTime() < minTime);
        const outOfBounds = isFutureDisabled || isPastDisabled;

        if (outOfBounds) {
            classes.push('disabled');
            classes.push('out-of-bounds');
            classes.push(isFutureDisabled ? 'future-disabled' : 'past-disabled');
        }

        const label = this.options.formatDate(date, 'long', this.options.locale);
        const tabIndex = outOfBounds ? -1 : 0;
        const ariaDisabled = outOfBounds ? 'true' : 'false';
        return `
            <div class="${classes.join(' ')}" data-date="${this.toDateKey(date)}" data-out-of-bounds="${outOfBounds}" tabindex="${tabIndex}" aria-disabled="${ariaDisabled}" aria-label="${label}">
                ${date.getDate()}
            </div>
        `;
    }

    renderEvents() {
        const events = this.getEventsForDateSorted(this.selectedDate);
        if (!events.length) return '';

        const dayLabel = this.options.formatDate(this.selectedDate, 'medium', this.options.locale);
        return `
            <div class="calendar-events">
                <div class="calendar-events-title">${dayLabel}</div>
                ${events.map(event => `
                    <div class="calendar-event" data-event-id="${String(event.id)}">
                        ${this.options.formatTime(new Date(event.startTime), this.options.locale)} ${event.title}
                    </div>
                `).join('')}
            </div>
        `;
    }

    /* ===============================
       NAVIGATION & INPUT
       =============================== */

    handleClick(event) {
        const navBtn = event.target.closest('.calendar-nav-btn');
        if (navBtn) {
            this.handleNav(navBtn);
            return;
        }

        const todayBtn = event.target.closest('.calendar-today-btn');
        if (todayBtn) {
            this.goToToday();
            return;
        }

        const viewBtn = event.target.closest('.calendar-view-btn');
        if (viewBtn) {
            this.changeView(viewBtn.dataset.view);
            return;
        }

        const day = event.target.closest('.calendar-day');
        if (day) {
            this.selectDay(day);
            return;
        }

        const eventEl = event.target.closest('.calendar-event, .day-event');
        if (eventEl && eventEl.dataset.eventId) {
            const targetEvent = this.events.find(e => String(e.id) === String(eventEl.dataset.eventId));
            if (targetEvent) {
                this.options.onEventClick?.(targetEvent);
            }
        }
    }

    selectDay(dayElement) {
        if (!dayElement?.dataset?.date) return;
        if (dayElement.dataset.outOfBounds === 'true') return;

        const [year, month, date] = dayElement.dataset.date.split('-').map(Number);
        const selected = new Date(year, month - 1, date);
        if (!this.isWithinBounds(selected)) return;
        this.selectedDate = selected;

        const targetMonth = month - 1;
        const targetYear = year;
        const currentMonth = this.currentDate.getMonth();
        const currentYear = this.currentDate.getFullYear();

        if (targetMonth !== currentMonth || targetYear !== currentYear) {
            this.currentDate = new Date(targetYear, targetMonth, 1);
            this.options.onMonthChange?.(new Date(this.currentDate));
        } else {
            this.currentDate = new Date(selected);
        }

        this.options.onDateSelect?.(new Date(selected));
        this.render();
    }

    handleNav(button) {
        if (button.disabled) return;
        if (button.classList.contains('prev-month')) {
            this.prevMonth();
        } else if (button.classList.contains('next-month')) {
            this.nextMonth();
        } else if (button.classList.contains('prev-year')) {
            this.changeYear(-1);
        } else if (button.classList.contains('next-year')) {
            this.changeYear(1);
        }
    }

    handleKeydown(event) {
        if (!this.container.contains(event.target)) return;
        this.handleNavigationKeys(event);
    }

    handleDocumentKeydown(event) {
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target.tagName)) return;
        if (document.activeElement === document.body) {
            this.handleNavigationKeys(event);
        }
    }

    handleNavigationKeys(event) {
        switch (event.key) {
            case 'ArrowLeft':
                this.navigateDays(-1);
                break;
            case 'ArrowRight':
                this.navigateDays(1);
                break;
            case 'ArrowUp':
                this.navigateDays(-7);
                break;
            case 'ArrowDown':
                this.navigateDays(7);
                break;
            case 'PageUp':
                if (event.ctrlKey) this.changeYear(-1);
                else this.prevMonth();
                break;
            case 'PageDown':
                if (event.ctrlKey) this.changeYear(1);
                else this.nextMonth();
                break;
            case 'Home':
                this.goToToday();
                break;
            default:
                return;
        }
        event.preventDefault();
    }

    setDate(dateInput, options = {}) {
        const normalized = this.clampDate(dateInput);
        if (!normalized) return;
        const shouldRender = options.render !== false;
        this.currentDate = new Date(normalized);
        this.selectedDate = new Date(normalized);
        if (!options.silent) {
            this.options.onDateSelect?.(new Date(this.selectedDate));
            this.options.onMonthChange?.(new Date(this.currentDate));
        }
        if (shouldRender) {
            this.render();
        }
    }

    navigateDays(amount) {
        const nextDate = new Date(this.currentDate);
        nextDate.setDate(nextDate.getDate() + amount);
        const clamped = this.clampDate(nextDate);
        if (!clamped) return;
        if (this.currentDate.getTime() === clamped.getTime()) return;
        this.currentDate = clamped;
        this.render();
    }

    prevMonth() {
        const target = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
        const clamped = this.clampDate(target);
        if (!clamped) return;
        const currentMonth = this.getMonthStartValue(this.currentDate);
        const nextMonth = this.getMonthStartValue(clamped);
        if (currentMonth !== null && nextMonth !== null && currentMonth === nextMonth) return;
        this.currentDate = clamped;
        this.options.onMonthChange?.(new Date(this.currentDate));
        this.render();
    }

    nextMonth() {
        const target = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
        const clamped = this.clampDate(target);
        if (!clamped) return;
        const currentMonth = this.getMonthStartValue(this.currentDate);
        const nextMonth = this.getMonthStartValue(clamped);
        if (currentMonth !== null && nextMonth !== null && currentMonth === nextMonth) return;
        this.currentDate = clamped;
        this.options.onMonthChange?.(new Date(this.currentDate));
        this.render();
    }

    changeYear(offset) {
        const target = new Date(this.currentDate.getFullYear() + offset, this.currentDate.getMonth(), 1);
        const clamped = this.clampDate(target);
        if (!clamped) return;
        const currentMonth = this.getMonthStartValue(this.currentDate);
        const nextMonth = this.getMonthStartValue(clamped);
        if (currentMonth !== null && nextMonth !== null && currentMonth === nextMonth) return;
        this.currentDate = clamped;
        this.options.onMonthChange?.(new Date(this.currentDate));
        this.render();
    }

    goToToday() {
        const today = this.clampDate(new Date());
        if (!today) return;
        this.currentDate = new Date(today);
        this.selectedDate = new Date(today);
        this.options.onDateSelect?.(new Date(today));
        this.options.onMonthChange?.(new Date(today));
        this.render();
    }

    changeView(view) {
        const requestedView = view === 'year' ? 'year' : 'month';
        if (requestedView === this.view) {
            if (requestedView === 'year') {
                this.view = 'month';
                this.options.onViewChange?.('month');
                this.render();
            }
            return;
        }
        this.view = requestedView;
        this.options.onViewChange?.(requestedView);
        this.render();
    }

    /* ===============================
       EVENTS CRUD
       =============================== */

    addEvent(event) {
        const source = event || {};
        const newEvent = {
            ...source,
            id: String(source.id || Date.now() + Math.random()),
            title: source.title || 'Untitled',
            date: new Date(source.date || new Date()),
            startTime: new Date(source.startTime || source.date || new Date()),
            endTime: new Date(source.endTime || source.startTime || source.date || new Date()),
            color: source.color || '#667eea'
        };
        this.events.push(newEvent);
        this.options.onEventAdd?.(newEvent);
        this.render();
        return newEvent;
    }

    updateEvent(id, updates) {
        const index = this.events.findIndex(event => String(event.id) === String(id));
        if (index === -1) return null;
        this.events[index] = { ...this.events[index], ...updates };
        this.options.onEventUpdate?.(this.events[index]);
        this.render();
        return this.events[index];
    }

    removeEvent(id) {
        const before = this.events.length;
        this.events = this.events.filter(event => String(event.id) !== String(id));
        if (this.events.length !== before) {
            this.options.onEventRemove?.(id);
            this.render();
        }
    }

    /* ===============================
       CSS INJECTION
       =============================== */

    static injectCSS() {
        if (document.getElementById('calendar-css')) return;
        const style = document.createElement('style');
        style.id = 'calendar-css';
        style.textContent = `
            .calendar { font-family: inherit; display: flex; flex-direction: column; gap: 8px; }
            .calendar-header { display: flex; align-items: center; justify-content: space-between; }
            .calendar-title { font-weight: 600; }
            .calendar-weekdays, .calendar-days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
            .calendar-day {
                padding: 8px;
                border-radius: 6px;
                text-align: center;
                cursor: pointer;
                user-select: none;
            }
            .calendar-day.selected {
                background: #4c6ef5;
                color: #fff;
            }
            .calendar-day.today {
                border: 1px solid #4c6ef5;
            }
            .calendar-day.disabled {
                opacity: 0.45;
                color: #666;
            }
            .calendar-day.disabled:hover {
                background: rgba(0,0,0,0.05);
            }
            .calendar-day.out-of-bounds {
                opacity: 0.25;
                color: #999;
                pointer-events: none;
            }
            .calendar-day:hover:not(.disabled) {
                background: rgba(76, 110, 245, 0.1);
            }
            .calendar-events { border-top: 1px solid rgba(0,0,0,0.1); padding-top: 8px; }
            .calendar-events-title { font-weight: 600; margin-bottom: 6px; }
            .calendar-footer { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
            .calendar-today-btn,
            .calendar-view-btn {
                padding: 6px 14px;
                border-radius: 20px;
                border: 1px solid rgba(0,0,0,0.15);
                background: rgba(0,0,0,0.05);
                font-size: 13px;
                font-weight: 600;
                color: inherit;
                cursor: pointer;
                transition: background 0.2s ease, color 0.2s ease;
            }
            .calendar-today-btn:hover,
            .calendar-view-btn:hover {
                background: rgba(0,0,0,0.09);
            }
            .calendar-view-btn.active {
                background: #4c6ef5;
                border-color: #4c6ef5;
                color: #fff;
            }
            .calendar-nav-btn {
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
                padding: 4px 12px;
                border-radius: 4px;
            }
            .calendar-nav-btn:hover {
                background: rgba(0,0,0,0.05);
            }
        `;
        document.head.appendChild(style);
    }
}

class TalkCalendarRange {
    constructor(options = {}) {
        this.host = typeof options.container === 'string'
            ? document.querySelector(options.container)
            : options.container;
        this.onChange = options.onChange || null;
        this.minDate = this.parseDate(options.minDate) || null;
        this.maxDate = this.parseDate(options.maxDate) || null;
        this.activeField = options.activeField === 'end' ? 'end' : 'start';
        this.range = this.sanitizeRange(options.initialRange || {});
        this.calendar = null;
        this.summaryEl = null;
        this.calendarMount = null;
        this.pillEls = [];
        this.ready = false;

        this.init();
    }

    parseDate(value) {
        if (!value) return null;
        const date = value instanceof Date ? new Date(value) : new Date(value);
        if (Number.isNaN(date.getTime())) return null;
        return new Date(date.getFullYear(), date.getMonth(), date.getDate());
    }

    toISO(date) {
        if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    sanitizeIsoValue(value) {
        if (!value) return null;
        const parsed = this.parseDate(value);
        if (!parsed) return null;
        if (this.minDate && parsed.getTime() < this.minDate.getTime()) {
            return this.toISO(this.minDate);
        }
        if (this.maxDate && parsed.getTime() > this.maxDate.getTime()) {
            return this.toISO(this.maxDate);
        }
        return this.toISO(parsed);
    }

    sanitizeRange(range = {}) {
        return {
            start: this.sanitizeIsoValue(range?.start),
            end: this.sanitizeIsoValue(range?.end)
        };
    }

    init() {
        if (!this.host) {
            console.warn('[TalkCalendarRange] Host container not found.');
            return;
        }

        this.host.classList.add('talk-calendar-range');
        this.host.innerHTML = `
            <div class="talk-calendar-range__controls">
                <div class="calendar-pill-group" role="tablist" aria-label="Select date field">
                    <button type="button" class="calendar-pill" data-field="start" aria-selected="${this.activeField === 'start'}">
                        <span class="pill-label">Start</span>
                        <span class="pill-value">${this.getPillValue('start')}</span>
                    </button>
                    <button type="button" class="calendar-pill" data-field="end" aria-selected="${this.activeField === 'end'}">
                        <span class="pill-label">End</span>
                        <span class="pill-value">${this.getPillValue('end')}</span>
                    </button>
                </div>
                <button type="button" class="calendar-swap-btn" data-action="swap" aria-label="Swap start and end dates">Swap</button>
            </div>
            <div class="talk-calendar-range__summary" aria-live="polite"></div>
            <div class="talk-calendar-range__calendar"></div>
        `;

        this.summaryEl = this.host.querySelector('.talk-calendar-range__summary');
        this.calendarMount = this.host.querySelector('.talk-calendar-range__calendar');
        this.pillEls = Array.from(this.host.querySelectorAll('.calendar-pill'));

        this.host.addEventListener('click', (event) => this.handleHostClick(event));

        this.initializeCalendar();
        this.updateSummary();
        this.updatePills();
        this.ready = true;
    }

    initializeCalendar() {
        if (typeof Calendar === 'undefined') {
            console.warn('[TalkCalendarRange] Calendar library is not available.');
            return;
        }

        this.calendar = new Calendar({
            container: this.calendarMount,
            showEvents: false,
            showWeekNumbers: false,
            onDateSelect: (date) => this.handleDateSelect(date),
            darkMode: document.body.classList.contains('dark-mode'),
            minDate: this.minDate,
            maxDate: this.maxDate
        });

        const focusDate = this.range.end || this.range.start;
        if (focusDate && typeof this.calendar.setDate === 'function') {
            this.calendar.setDate(focusDate, { silent: true });
        }
    }

    handleHostClick(event) {
        const pill = event.target.closest('.calendar-pill');
        if (pill) {
            this.setActiveField(pill.dataset.field);
            return;
        }

        const swapBtn = event.target.closest('.calendar-swap-btn');
        if (swapBtn) {
            this.swapRange();
        }
    }

    handleDateSelect(date) {
        if (!date) return;
        const normalizedDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        if (!this.isWithinBounds(normalizedDate)) return;

        const iso = this.toISO(normalizedDate);
        const nextRange = { ...this.range };

        if (this.activeField === 'start') {
            nextRange.start = iso;
            if (nextRange.end && nextRange.end < iso) {
                nextRange.end = iso;
            }
        } else {
            nextRange.end = iso;
            if (nextRange.start && nextRange.start > iso) {
                nextRange.start = iso;
            }
        }

        this.range = nextRange;
        this.updateSummary();
        this.updatePills();

        if (typeof this.onChange === 'function') {
            this.onChange({ ...this.range }, { source: 'calendar', activeField: this.activeField });
        }

        if (this.activeField === 'start' && (!nextRange.end || nextRange.start === nextRange.end)) {
            this.setActiveField('end');
        }
    }

    setActiveField(field) {
        if (!field || (field !== 'start' && field !== 'end')) return;
        this.activeField = field;
        this.updatePills();
    }

    swapRange() {
        if (!this.range.start && !this.range.end) return;
        const swapped = { start: this.range.end, end: this.range.start };
        this.range = this.sanitizeRange(swapped);
        this.updateSummary();
        this.updatePills();

        if (typeof this.onChange === 'function') {
            this.onChange({ ...this.range }, { source: 'swap' });
        }
    }

    isWithinBounds(date) {
        const time = date.getTime();
        if (this.minDate && time < this.minDate.getTime()) return false;
        if (this.maxDate && time > this.maxDate.getTime()) return false;
        return true;
    }

    getPillValue(field) {
        const value = this.range[field];
        return value ? this.formatDisplayDate(value) : 'Not set';
    }

    updatePills() {
        this.pillEls.forEach((pill) => {
            const field = pill.dataset.field;
            const valueEl = pill.querySelector('.pill-value');
            if (valueEl) {
                valueEl.textContent = this.getPillValue(field);
            }
            const isActive = field === this.activeField;
            pill.classList.toggle('active', isActive);
            pill.setAttribute('aria-selected', String(isActive));
        });
    }

    updateSummary() {
        if (!this.summaryEl) return;
        const { start, end } = this.range;

        if (!start && !end) {
            this.summaryEl.textContent = 'Select a date range using the calendar below.';
            return;
        }

        if (start && end) {
            this.summaryEl.textContent = `${this.formatDisplayDate(start)} to ${this.formatDisplayDate(end)}`;
            return;
        }

        if (start) {
            this.summaryEl.textContent = `Starting ${this.formatDisplayDate(start)}`;
            return;
        }

        this.summaryEl.textContent = `Ending ${this.formatDisplayDate(end)}`;
    }

    formatDisplayDate(isoDate) {
        if (!isoDate) return '';
        const date = new Date(isoDate);
        if (Number.isNaN(date.getTime())) return isoDate;
        return date.toLocaleDateString(undefined, {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    }

    setRange(range = {}, options = {}) {
        this.range = this.sanitizeRange(range);

        if (range.activeField) {
            this.activeField = range.activeField;
        }

        this.updateSummary();
        this.updatePills();

        const focusDate = range.focusDate || this.range.end || this.range.start;
        if (focusDate && this.calendar && typeof this.calendar.setDate === 'function' && !options.preserveView) {
            this.calendar.setDate(focusDate, { silent: true });
        }

        if (!options.silent && typeof this.onChange === 'function') {
            this.onChange({ ...this.range }, { source: options.source || 'external' });
        }
    }

    clear(options = {}) {
        this.range = { start: null, end: null };
        this.updateSummary();
        this.updatePills();
        if (!options.silent && typeof this.onChange === 'function') {
            this.onChange({ ...this.range }, { source: 'clear' });
        }
    }
}

Calendar.TalkCalendarRange = TalkCalendarRange;

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Calendar;
    module.exports.TalkCalendarRange = TalkCalendarRange;
} else {
    window.Calendar = Calendar;
    window.TalkCalendarRange = TalkCalendarRange;
}
