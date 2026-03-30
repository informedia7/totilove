// Calculates Western star sign and Chinese zodiac from a date of birth.
// Exposes a single function: star_sign_zodiac_calculation(dob)
// dob can be a Date instance or a date-compatible string.

(function () {
    // Western star sign date boundaries (inclusive).
    const westernSigns = [
        { name: 'Capricorn', start: { m: 12, d: 22 }, end: { m: 1, d: 19 } },
        { name: 'Aquarius', start: { m: 1, d: 20 }, end: { m: 2, d: 18 } },
        { name: 'Pisces', start: { m: 2, d: 19 }, end: { m: 3, d: 20 } },
        { name: 'Aries', start: { m: 3, d: 21 }, end: { m: 4, d: 19 } },
        { name: 'Taurus', start: { m: 4, d: 20 }, end: { m: 5, d: 20 } },
        { name: 'Gemini', start: { m: 5, d: 21 }, end: { m: 6, d: 20 } },
        { name: 'Cancer', start: { m: 6, d: 21 }, end: { m: 7, d: 22 } },
        { name: 'Leo', start: { m: 7, d: 23 }, end: { m: 8, d: 22 } },
        { name: 'Virgo', start: { m: 8, d: 23 }, end: { m: 9, d: 22 } },
        { name: 'Libra', start: { m: 9, d: 23 }, end: { m: 10, d: 22 } },
        { name: 'Scorpio', start: { m: 10, d: 23 }, end: { m: 11, d: 21 } },
        { name: 'Sagittarius', start: { m: 11, d: 22 }, end: { m: 12, d: 21 } }
    ];

    const chineseZodiacAnimals = [
        'Rat', 'Ox', 'Tiger', 'Rabbit', 'Dragon', 'Snake',
        'Horse', 'Goat', 'Monkey', 'Rooster', 'Dog', 'Pig'
    ];

    function parseDate(dob) {
        if (dob instanceof Date) return dob;
        const parsed = new Date(dob);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
    }

    function getWesternSign(date) {
        const month = date.getUTCMonth() + 1; // 1-12
        const day = date.getUTCDate();        // 1-31
        for (const sign of westernSigns) {
            const { start, end, name } = sign;
            const wrapsYear = start.m > end.m;

            if (wrapsYear) {
                // e.g., Capricorn spans Dec 22 - Jan 19
                const inRange =
                    (month === start.m && day >= start.d) ||
                    (month === end.m && day <= end.d) ||
                    month > start.m || month < end.m;
                if (inRange) return name;
            } else {
                if (
                    (month === start.m && day >= start.d) ||
                    (month === end.m && day <= end.d) ||
                    (month > start.m && month < end.m)
                ) {
                    return name;
                }
            }
        }
        return null;
    }

    function getChineseZodiac(date) {
        const year = date.getUTCFullYear();
        // Gregorian-year mapping; 2020 was Rat, offset 4
        const idx = ((year - 4) % 12 + 12) % 12;
        return chineseZodiacAnimals[idx] || null;
    }

    function star_sign_zodiac_calculation(dob) {
        const date = parseDate(dob);
        if (!date) {
            return { starSign: null, chineseZodiac: null };
        }
        return {
            starSign: getWesternSign(date),
            chineseZodiac: getChineseZodiac(date)
        };
    }

    // Expose globally
    if (typeof window !== 'undefined') {
        window.star_sign_zodiac_calculation = star_sign_zodiac_calculation;
    }
    if (typeof module !== 'undefined') {
        module.exports = { star_sign_zodiac_calculation };
    }
})();

