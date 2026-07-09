const DAY_ALIASES = {
    pn: 1, wt: 2, sr: 3, śr: 3, czw: 4, pt: 5, sob: 6, nd: 0, ndz: 0
};

const TIME_RE = /(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})/;
const DAY_RANGE_RE = /^([a-złśćżźń]+)(?:\s*-\s*([a-złśćżźń]+))?/i;

function dayRangeIncludes(fromDay, toDay, day) {
    if (toDay === undefined) {
        return day === fromDay;
    }
    if (fromDay <= toDay) {
        return day >= fromDay && day <= toDay;
    }
    return day >= fromDay || day <= toDay;
}

function fmtMinutes(minutes) {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

// Wyciąga wiodący zakres dni z fragmentu (np. "Pn-Pt", "Sob", "Śr").
// Zwraca { fromDay, toDay } lub null, gdy fragment nie zaczyna się od nazwy dnia.
function parseDayRange(text) {
    const match = text.match(DAY_RANGE_RE);
    if (!match) {
        return null;
    }

    const fromDay = DAY_ALIASES[match[1].toLowerCase()];
    if (fromDay === undefined) {
        return null;
    }

    const toDay = match[2] ? DAY_ALIASES[match[2].toLowerCase()] : undefined;
    return { fromDay, toDay };
}

// Rozbija swobodny tekst godzin na segmenty { fromDay, toDay, fromMinutes, toMinutes }.
// Obsługuje wzorce, w których kilka dni dzieli wspólny zakres godzin zapisany po
// przecinku, np. "Pn-Śr, Pt-Nd 06:00-22:00" albo "Pn, Śr, Pt 07:00-18:00" —
// godzina z danego fragmentu obejmuje też poprzedzające go fragmenty złożone
// z samych nazw dni. Fragmenty oznaczone jako "zamknięte" pomijamy.
function parseGodziny(godziny) {
    if (!godziny || typeof godziny !== 'string') {
        return [];
    }

    const segments = [];
    let pendingDays = [];

    for (const rawPart of godziny.split(',')) {
        const part = rawPart.trim();
        if (!part || /zamkni/i.test(part)) {
            continue;
        }

        const timeMatch = part.match(TIME_RE);
        const dayRange = parseDayRange(part);

        if (!timeMatch) {
            // Fragment z samą nazwą dnia — czeka na wspólną godzinę z kolejnego fragmentu.
            if (dayRange) {
                pendingDays.push(dayRange);
            }
            continue;
        }

        const fromMinutes = Number(timeMatch[1]) * 60 + Number(timeMatch[2]);
        const toMinutes = Number(timeMatch[3]) * 60 + Number(timeMatch[4]);

        let ranges;
        if (dayRange) {
            ranges = [...pendingDays, dayRange];
        } else if (pendingDays.length) {
            ranges = pendingDays;
        } else {
            ranges = [null]; // brak nazw dni -> zakres obowiązuje codziennie
        }

        for (const range of ranges) {
            segments.push({
                fromDay: range ? range.fromDay : undefined,
                toDay: range ? range.toDay : undefined,
                fromMinutes,
                toMinutes
            });
        }
        pendingDays = [];
    }

    return segments;
}

function segmentMatchesDay(segment, day) {
    return segment.fromDay === undefined
        || dayRangeIncludes(segment.fromDay, segment.toDay, day);
}

/**
 * Zwraca godziny otwarcia na dziś w formacie "HH:MM–HH:MM", albo null gdy
 * nie można ustalić (brak danych lub nierozpoznany format).
 */
export function getTodayHours(godziny, now = new Date()) {
    const day = now.getDay();

    for (const segment of parseGodziny(godziny)) {
        if (segmentMatchesDay(segment, day)) {
            return `${fmtMinutes(segment.fromMinutes)}–${fmtMinutes(segment.toMinutes)}`;
        }
    }

    return null;
}

/**
 * Best-effort check whether a place is open right now, parsed from free-text
 * "godziny" field. Returns null when the format can't be parsed, so callers
 * can treat unknown status as "don't filter out" rather than "closed".
 */
export function isOpenNow(godziny, now = new Date()) {
    const segments = parseGodziny(godziny);

    if (segments.length === 0) {
        return null;
    }

    const day = now.getDay();
    const minutes = now.getHours() * 60 + now.getMinutes();

    return segments.some(segment => {
        if (!segmentMatchesDay(segment, day)) {
            return false;
        }

        if (segment.toMinutes < segment.fromMinutes) {
            return minutes >= segment.fromMinutes || minutes <= segment.toMinutes;
        }

        return minutes >= segment.fromMinutes && minutes <= segment.toMinutes;
    });
}
