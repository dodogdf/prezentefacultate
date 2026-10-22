/**
 * Datele oficiale din orarul de facultate (Luni – Vineri, 13 activități: 7 seminare și 6 cursuri)
 * și logica pură pentru evidența prezențelor + pragul minim per profesor.
 */

export const STORAGE_KEY = "prezente_facultate_v1";
export const MAX_WEEKS = 14;

export const DAYS_ORDER = ["Luni", "Marți", "Miercuri", "Joi", "Vineri"];

export const DAY_DATES = {
  Luni: "19/10/2026",
  Marți: "20/10/2026",
  Miercuri: "21/10/2026",
  Joi: "22/10/2026",
  Vineri: "23/10/2026",
};

export const INITIAL_SCHEDULE = [
  {
    id: "luni-engleza-sem",
    day: "Luni",
    dateRef: "19/10/2026",
    time: "12:30 - 14:00",
    subject: "Limba engleză 1",
    professor: "Cadru asoc Lect.dr. BIRTALAN Ana-Maria",
    type: "SEMINAR",
    room: "1101",
    defaultRequired: 10,
    maxWeeks: MAX_WEEKS,
  },
  {
    id: "luni-drept-curs",
    day: "Luni",
    dateRef: "19/10/2026",
    time: "14:10 - 15:40",
    subject: "Dreptul afacerilor",
    professor: "lect.univ.dr. CALIN DRAGOS",
    type: "CURS",
    room: "0601",
    defaultRequired: 7,
    maxWeeks: MAX_WEEKS,
  },
  {
    id: "luni-drept-sem",
    day: "Luni",
    dateRef: "19/10/2026",
    time: "15:50 - 17:20",
    subject: "Dreptul afacerilor",
    professor: "lect.univ.dr. MOȚATU Adriana",
    type: "SEMINAR",
    room: "1101",
    defaultRequired: 10,
    maxWeeks: MAX_WEEKS,
  },
  {
    id: "marti-rei-sem",
    day: "Marți",
    dateRef: "20/10/2026",
    time: "14:10 - 15:40",
    subject: "Relații economice internaționale",
    professor: "asist.univ. PARASCHIV Liana Ioana",
    type: "SEMINAR",
    room: "1101",
    defaultRequired: 10,
    maxWeeks: MAX_WEEKS,
  },
  {
    id: "marti-psiho-sem",
    day: "Marți",
    dateRef: "20/10/2026",
    time: "15:50 - 17:20",
    subject: "Psihosociologie",
    professor: "conf.univ.dr. RUJOIU Florian-Octavian",
    type: "SEMINAR",
    room: "1101",
    defaultRequired: 10,
    maxWeeks: MAX_WEEKS,
  },
  {
    id: "miercuri-micro-sem",
    day: "Miercuri",
    dateRef: "21/10/2026",
    time: "07:30 - 09:00",
    subject: "Microeconomie",
    professor: "lect.univ.dr. JIANU IONUȚ",
    type: "SEMINAR",
    room: "1101",
    defaultRequired: 10,
    maxWeeks: MAX_WEEKS,
  },
  {
    id: "miercuri-rei-curs",
    day: "Miercuri",
    dateRef: "21/10/2026",
    time: "10:50 - 12:20",
    subject: "Relații economice internaționale",
    professor: "lect.univ.dr. CANDIDATU Camelia",
    type: "CURS",
    room: "2202",
    defaultRequired: 7,
    maxWeeks: MAX_WEEKS,
  },
  {
    id: "miercuri-marketing-curs",
    day: "Miercuri",
    dateRef: "21/10/2026",
    time: "12:30 - 14:00",
    subject: "Marketing",
    professor: "prof.univ.dr. DUMITRU Ionel",
    type: "CURS",
    room: "2202",
    defaultRequired: 7,
    maxWeeks: MAX_WEEKS,
  },
  {
    id: "joi-sport-sem",
    day: "Joi",
    dateRef: "22/10/2026",
    time: "12:30 - 14:00",
    subject: "Educație fizică și sport 1",
    professor: "conf.univ.dr. CHIRU RELA -VALENTINA",
    type: "SEMINAR",
    room: "0S01B",
    defaultRequired: 10,
    maxWeeks: MAX_WEEKS,
  },
  {
    id: "joi-psiho-curs",
    day: "Joi",
    dateRef: "22/10/2026",
    time: "14:10 - 15:40",
    subject: "Psihosociologie",
    professor: "conf.univ.dr. RUJOIU Florian-Octavian",
    type: "CURS",
    room: "2202",
    defaultRequired: 7,
    maxWeeks: MAX_WEEKS,
  },
  {
    id: "joi-micro-curs",
    day: "Joi",
    dateRef: "22/10/2026",
    time: "15:50 - 17:20",
    subject: "Microeconomie",
    professor: "prof.univ.dr. MARINESCU Cosmin Stefan",
    type: "CURS",
    room: "AMF. I",
    defaultRequired: 7,
    maxWeeks: MAX_WEEKS,
  },
  {
    id: "vineri-info-curs",
    day: "Vineri",
    dateRef: "23/10/2026",
    time: "07:30 - 09:00",
    subject: "Informatică economică",
    professor: "conf.univ.dr. SILVESTRU Cătălin Ionuț",
    type: "CURS",
    room: "2202",
    defaultRequired: 7,
    maxWeeks: MAX_WEEKS,
  },
  {
    id: "vineri-marketing-sem",
    day: "Vineri",
    dateRef: "23/10/2026",
    time: "09:10 - 10:40",
    subject: "Marketing",
    professor: "lect.univ.dr. TURKEȘ Mirela Cătălina",
    type: "SEMINAR",
    room: "1101",
    defaultRequired: 10,
    maxWeeks: MAX_WEEKS,
  },
];

function clampInt(value, min, max, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function normalizeSlots(checkedSlots, attendedCount, maxWeeks = MAX_WEEKS) {
  if (Array.isArray(checkedSlots) && checkedSlots.length === maxWeeks) {
    return checkedSlots.map((v) => Boolean(v));
  }
  const slots = new Array(maxWeeks).fill(false);
  for (let i = 0; i < Math.min(attendedCount, maxWeeks); i += 1) {
    slots[i] = true;
  }
  return slots;
}

/**
 * Verifică dacă studentul a atins sau depășit numărul minim de prezențe cerut de profesor.
 */
export function isTargetMet(attendedCount, requiredTarget) {
  const attended = Number(attendedCount) || 0;
  const target = Number(requiredTarget);
  if (!Number.isFinite(target) || target <= 0) {
    return false;
  }
  return attended >= target;
}

/**
 * Construiește starea inițială (sau hidratează din localStorage) pentru toate cele 13 activități.
 */
export function createInitialState(savedMap = {}) {
  const state = {};
  const safeSaved = savedMap && typeof savedMap === "object" ? savedMap : {};

  for (const item of INITIAL_SCHEDULE) {
    const raw = safeSaved[item.id] || {};
    const requiredTarget = clampInt(
      raw.requiredTarget,
      0,
      item.maxWeeks,
      item.defaultRequired
    );

    let checkedSlots;
    let attendedCount;

    if (Array.isArray(raw.checkedSlots) && raw.checkedSlots.length === item.maxWeeks) {
      checkedSlots = raw.checkedSlots.map((v) => Boolean(v));
      attendedCount = checkedSlots.filter(Boolean).length;
    } else {
      attendedCount = clampInt(raw.attendedCount, 0, item.maxWeeks, 0);
      checkedSlots = normalizeSlots(null, attendedCount, item.maxWeeks);
    }

    state[item.id] = {
      attendedCount,
      requiredTarget,
      checkedSlots,
      lastUpdated: typeof raw.lastUpdated === "string" ? raw.lastUpdated : null,
    };
  }

  return state;
}

/**
 * Adaugă o prezență (+) la cursul sau seminarul selectat.
 */
export function incrementAttendance(state, activityId) {
  const current = state[activityId];
  if (!current) return state;

  const nextSlots = [...current.checkedSlots];
  const firstUncheckedIdx = nextSlots.findIndex((checked) => !checked);
  if (firstUncheckedIdx !== -1) {
    nextSlots[firstUncheckedIdx] = true;
  }

  const nextCount = nextSlots.filter(Boolean).length;
  return {
    ...state,
    [activityId]: {
      ...current,
      attendedCount: nextCount,
      checkedSlots: nextSlots,
      lastUpdated: new Date().toISOString(),
    },
  };
}

/**
 * Scade o prezență (-) de la cursul sau seminarul selectat.
 */
export function decrementAttendance(state, activityId) {
  const current = state[activityId];
  if (!current) return state;

  const nextSlots = [...current.checkedSlots];
  for (let i = nextSlots.length - 1; i >= 0; i -= 1) {
    if (nextSlots[i]) {
      nextSlots[i] = false;
      break;
    }
  }

  const nextCount = nextSlots.filter(Boolean).length;
  return {
    ...state,
    [activityId]: {
      ...current,
      attendedCount: nextCount,
      checkedSlots: nextSlots,
      lastUpdated: new Date().toISOString(),
    },
  };
}

/**
 * Bifează sau debifează direct o săptămână (S1..S14) și sincronizează numărul total de prezențe.
 */
export function toggleSessionSlot(state, activityId, weekIndex) {
  const current = state[activityId];
  if (!current) return state;
  const idx = Number(weekIndex);
  if (!Number.isInteger(idx) || idx < 0 || idx >= current.checkedSlots.length) {
    return state;
  }

  const nextSlots = [...current.checkedSlots];
  nextSlots[idx] = !nextSlots[idx];
  const nextCount = nextSlots.filter(Boolean).length;

  return {
    ...state,
    [activityId]: {
      ...current,
      attendedCount: nextCount,
      checkedSlots: nextSlots,
      lastUpdated: new Date().toISOString(),
    },
  };
}

/**
 * Modifică numărul minim de prezențe cerut de profesor pentru un anumit seminar sau curs.
 */
export function setRequiredTarget(state, activityId, newTarget) {
  const current = state[activityId];
  if (!current) return state;

  const clampedTarget = clampInt(
    newTarget,
    0,
    MAX_WEEKS,
    current.requiredTarget
  );

  return {
    ...state,
    [activityId]: {
      ...current,
      requiredTarget: clampedTarget,
      lastUpdated: new Date().toISOString(),
    },
  };
}

/**
 * Calculează statisticile generale pentru panoul de sus (KPI Ledger Strip).
 */
export function computeDashboardStats(state) {
  let totalActivities = INITIAL_SCHEDULE.length;
  let completedActivities = 0;
  let totalSeminars = 0;
  let completedSeminars = 0;
  let totalCourses = 0;
  let completedCourses = 0;
  let totalAttendances = 0;
  let totalRequired = 0;

  for (const item of INITIAL_SCHEDULE) {
    const entry = state[item.id] || {
      attendedCount: 0,
      requiredTarget: item.defaultRequired,
    };
    const met = isTargetMet(entry.attendedCount, entry.requiredTarget);

    totalAttendances += entry.attendedCount;
    totalRequired += entry.requiredTarget;

    if (met) {
      completedActivities += 1;
    }

    if (item.type === "SEMINAR") {
      totalSeminars += 1;
      if (met) completedSeminars += 1;
    } else {
      totalCourses += 1;
      if (met) completedCourses += 1;
    }
  }

  const overallCompletionPercent =
    totalActivities > 0
      ? Math.round((completedActivities / totalActivities) * 100)
      : 0;

  return {
    totalActivities,
    completedActivities,
    totalSeminars,
    completedSeminars,
    totalCourses,
    completedCourses,
    totalAttendances,
    totalRequired,
    overallCompletionPercent,
  };
}
