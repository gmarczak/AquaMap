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

function parseSegment(segment) {
    const timeMatch = segment.match(TIME_RE);
    if (!timeMatch) {
        return null;
    }

    const [, fromH, fromM, toH, toM] = timeMatch;
    const dayMatch = segment.match(DAY_RANGE_RE);
    let fromDay;
    let toDay;

    if (dayMatch) {
        const fromAlias = DAY_ALIASES[dayMatch[1].toLowerCase()];
        const toAlias = dayMatch[2] ? DAY_ALIASES[dayMatch[2].toLowerCase()] : undefined;

        if (fromAlias !== undefined) {
            fromDay = fromAlias;
            toDay = toAlias;
        }
    }

    return {
        fromDay,
        toDay,
        fromMinutes: Number(fromH) * 60 + Number(fromM),
        toMinutes: Number(toH) * 60 + Number(toM)
    };
}

/**
 * Best-effort check whether a place is open right now, parsed from free-text
 * "godziny" field. Returns null when the format can't be parsed, so callers
 * can treat unknown status as "don't filter out" rather than "closed".
 */
export function isOpenNow(godziny, now = new Date()) {
    if (!godziny || typeof godziny !== 'string') {
        return null;
    }

    const segments = godziny.split(',').map(parseSegment).filter(Boolean);

    if (segments.length === 0) {
        return null;
    }

    const day = now.getDay();
    const minutes = now.getHours() * 60 + now.getMinutes();

    return segments.some(segment => {
        if (segment.fromDay !== undefined && !dayRangeIncludes(segment.fromDay, segment.toDay, day)) {
            return false;
        }

        if (segment.toMinutes < segment.fromMinutes) {
            return minutes >= segment.fromMinutes || minutes <= segment.toMinutes;
        }

        return minutes >= segment.fromMinutes && minutes <= segment.toMinutes;
    });
}
