import {
  STORAGE_KEY,
  MAX_WEEKS,
  DAYS_ORDER,
  DAY_DATES,
  INITIAL_SCHEDULE,
  createInitialState,
  isTargetMet,
  incrementAttendance,
  decrementAttendance,
  toggleSessionSlot,
  setRequiredTarget,
  computeDashboardStats,
} from "./schedule-data.js";

const CHECK_SVG = `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
const PLUS_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const CLOUD_CONFIG_KEY = "prezente_facultate_cloud_v1";

export function loadCloudConfig() {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return { dbUrl: "", pin: "" };
    }
    const raw = window.localStorage.getItem(CLOUD_CONFIG_KEY);
    if (!raw) return { dbUrl: "", pin: "" };
    const parsed = JSON.parse(raw);
    return {
      dbUrl: String(parsed?.dbUrl || "").trim().replace(/\/+$/, ""),
      pin: String(parsed?.pin || "").trim().replace(/[^a-zA-Z0-9_-]/g, ""),
    };
  } catch {
    return { dbUrl: "", pin: "" };
  }
}

export function saveCloudConfig(config) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(
        CLOUD_CONFIG_KEY,
        JSON.stringify({
          dbUrl: String(config?.dbUrl || "").trim().replace(/\/+$/, ""),
          pin: String(config?.pin || "").trim().replace(/[^a-zA-Z0-9_-]/g, ""),
        })
      );
    }
  } catch {
    // Ignore storage quota errors
  }
}

export function buildCloudEndpoint(dbUrl, pin) {
  const cleanUrl = String(dbUrl || "").trim().replace(/\/+$/, "");
  const cleanPin = String(pin || "").trim().replace(/[^a-zA-Z0-9_-]/g, "");
  if (!cleanUrl || !cleanPin) return null;
  if (cleanUrl.endsWith(".json")) return cleanUrl;
  return `${cleanUrl}/prezente_${cleanPin}.json`;
}

export function encodeCompactSync(state) {
  return INITIAL_SCHEDULE.map((item) => {
    const entry = state[item.id] || {};
    const attended = Math.max(0, Math.min(MAX_WEEKS, Number(entry.attendedCount) || 0));
    const target = Math.max(0, Math.min(MAX_WEEKS, Number(entry.requiredTarget) ?? item.defaultRequired));
    let mask = 0;
    const slots = Array.isArray(entry.checkedSlots) ? entry.checkedSlots : [];
    for (let i = 0; i < MAX_WEEKS; i += 1) {
      if (slots[i]) mask |= 1 << i;
    }
    return `${attended}.${target}.${mask.toString(36)}`;
  }).join("_");
}

export function decodeCompactSync(code) {
  if (!code || typeof code !== "string") return null;
  const parts = code.trim().split("_");
  if (parts.length !== INITIAL_SCHEDULE.length) return null;
  const rawState = {};
  for (let idx = 0; idx < INITIAL_SCHEDULE.length; idx += 1) {
    const item = INITIAL_SCHEDULE[idx];
    const [attStr, tarStr, maskStr] = parts[idx].split(".");
    const attendedCount = Number(attStr);
    const requiredTarget = Number(tarStr);
    const mask = parseInt(maskStr || "0", 36);
    if (!Number.isFinite(attendedCount) || !Number.isFinite(requiredTarget) || !Number.isFinite(mask)) {
      return null;
    }
    const checkedSlots = new Array(MAX_WEEKS).fill(false);
    for (let bit = 0; bit < MAX_WEEKS; bit += 1) {
      checkedSlots[bit] = Boolean(mask & (1 << bit));
    }
    rawState[item.id] = {
      attendedCount,
      requiredTarget,
      checkedSlots,
      lastUpdated: new Date().toISOString(),
    };
  }
  return createInitialState(rawState);
}

export const CALENDAR_STORAGE_KEY = "prezente_facultate_calendar_v1";

export const SUBJECT_OPTIONS = [
  ...new Set(INITIAL_SCHEDULE.map((it) => it.subject)),
  "Altă materie / General",
];

const ROMANIAN_MONTHS = [
  "Ianuarie",
  "Februarie",
  "Martie",
  "Aprilie",
  "Mai",
  "Iunie",
  "Iulie",
  "August",
  "Septembrie",
  "Octombrie",
  "Noiembrie",
  "Decembrie",
];

export function sanitizeCalendarItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];
  return rawItems
    .filter((it) => it && typeof it === "object" && it.title && it.date)
    .map((it) => ({
      id: String(it.id || `cal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
      title: String(it.title).trim(),
      subject: String(it.subject || SUBJECT_OPTIONS[0]).trim(),
      type: ["EXAMEN", "PROIECT", "COLOCVIU", "TEMA"].includes(it.type)
        ? it.type
        : "EXAMEN",
      date: String(it.date).slice(0, 10),
      meta: String(it.meta || "").trim(),
      completed: Boolean(it.completed),
      createdAt: String(it.createdAt || new Date().toISOString()),
    }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

export function loadCalendarItems() {
  try {
    if (typeof window === "undefined" || !window.localStorage) return [];
    const raw = window.localStorage.getItem(CALENDAR_STORAGE_KEY);
    if (!raw) return [];
    return sanitizeCalendarItems(JSON.parse(raw));
  } catch {
    return [];
  }
}

export function addCalendarItem(items, payload) {
  const cleanTitle = String(payload?.title || "").trim();
  const cleanDate = String(payload?.date || "").slice(0, 10);
  if (!cleanTitle || !cleanDate) return sanitizeCalendarItems(items);
  const nextItem = {
    id: `cal-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: cleanTitle,
    subject: String(payload?.subject || SUBJECT_OPTIONS[0]).trim(),
    type: ["EXAMEN", "PROIECT", "COLOCVIU", "TEMA"].includes(payload?.type)
      ? payload.type
      : "EXAMEN",
    date: cleanDate,
    meta: String(payload?.meta || "").trim(),
    completed: false,
    createdAt: new Date().toISOString(),
  };
  return sanitizeCalendarItems([...(Array.isArray(items) ? items : []), nextItem]);
}

export function toggleCalendarItem(items, id) {
  return sanitizeCalendarItems(
    (Array.isArray(items) ? items : []).map((it) =>
      it.id === id ? { ...it, completed: !it.completed } : it
    )
  );
}

export function deleteCalendarItem(items, id) {
  return sanitizeCalendarItems(
    (Array.isArray(items) ? items : []).filter((it) => it.id !== id)
  );
}

export async function pushStateToCloud(state, calendarItems = null) {
  const { dbUrl, pin } = loadCloudConfig();
  const endpoint = buildCloudEndpoint(dbUrl, pin);
  if (!endpoint || typeof fetch === "undefined") return false;
  const calToSync = Array.isArray(calendarItems) ? calendarItems : loadCalendarItems();
  try {
    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        updatedAt: new Date().toISOString(),
        pin,
        state,
        calendarItems: calToSync,
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function pullStateFromCloud() {
  const { dbUrl, pin } = loadCloudConfig();
  const endpoint = buildCloudEndpoint(dbUrl, pin);
  if (!endpoint || typeof fetch === "undefined") return null;
  try {
    const response = await fetch(endpoint, { method: "GET", cache: "no-store" });
    if (!response.ok) return null;
    const data = await response.json();
    if (!data || typeof data !== "object") return null;
    const rawState = data.state && typeof data.state === "object" ? data.state : data;
    if (Array.isArray(data.calendarItems) && typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(
        CALENDAR_STORAGE_KEY,
        JSON.stringify(sanitizeCalendarItems(data.calendarItems))
      );
    }
    return createInitialState(rawState);
  } catch {
    return null;
  }
}

export function loadState() {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return createInitialState({});
    }
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return createInitialState({});
    }
    const parsed = JSON.parse(raw);
    return createInitialState(parsed);
  } catch {
    return createInitialState({});
  }
}

export function saveCalendarItems(items, currentState = null, options = { syncCloud: true }) {
  const sanitized = sanitizeCalendarItems(items);
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(CALENDAR_STORAGE_KEY, JSON.stringify(sanitized));
    }
    const saveStatusEl =
      typeof document !== "undefined"
        ? document.getElementById("save-status")
        : null;
    const { dbUrl, pin } = loadCloudConfig();
    const isCloud = Boolean(dbUrl && pin);
    const now = new Date().toLocaleTimeString("ro-RO");
    if (saveStatusEl) {
      saveStatusEl.innerHTML = `<span class="status-dot" aria-hidden="true"></span><span>${
        isCloud ? `Salvat local + Cloud (${escapeHtml(pin)}) la ${now}` : `Salvat automat la ${now}`
      }</span>`;
    }
    if (options?.syncCloud !== false && isCloud) {
      pushStateToCloud(currentState || loadState(), sanitized);
    }
  } catch {
    // Ignore storage quota errors
  }
  return sanitized;
}

export function saveState(state, options = { syncCloud: true }) {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    }
    const saveStatusEl =
      typeof document !== "undefined"
        ? document.getElementById("save-status")
        : null;
    const { dbUrl, pin } = loadCloudConfig();
    const isCloud = Boolean(dbUrl && pin);
    const now = new Date().toLocaleTimeString("ro-RO");
    if (saveStatusEl) {
      saveStatusEl.innerHTML = `<span class="status-dot" aria-hidden="true"></span><span>${
        isCloud ? `Salvat local + Cloud (${escapeHtml(pin)}) la ${now}` : `Salvat automat la ${now}`
      }</span>`;
    }
    if (options?.syncCloud !== false && isCloud) {
      pushStateToCloud(state);
    }
  } catch {
    // Ignore storage quota errors in private browsing
  }
}

export function renderActivityCard(item, itemState) {
  const attended = Number(itemState.attendedCount) || 0;
  const target = Number(itemState.requiredTarget) || 0;
  const met = isTargetMet(attended, target);
  const remaining = Math.max(0, target - attended);
  const progressPct =
    target > 0 ? Math.min(100, Math.round((attended / target) * 100)) : 0;

  const typeClass =
    item.type === "SEMINAR" ? "type-badge-seminar" : "type-badge-curs";

  const statusBadgeHtml = met
    ? `<div class="green-check-badge" data-testid="green-check-${escapeHtml(item.id)}">
         <span class="green-check-icon">${CHECK_SVG}</span>
         <span>Prezențe minime atinse (${attended}/${target})</span>
       </div>`
    : `<div class="pending-status-badge" data-testid="pending-badge-${escapeHtml(item.id)}">
         <span>${target > 0 ? `Mai ai nevoie de ${remaining} prezențe` : "Fără prag minim (0)"}</span>
       </div>`;

  const inlineTitleCheckHtml = met
    ? `<span class="subject-green-check-inline" title="Prag minim de prezențe îndeplinit">${CHECK_SVG}</span>`
    : "";

  const slotsHtml = itemState.checkedSlots
    .map((isChecked, idx) => {
      const weekNum = idx + 1;
      const isTargetMarker = target > 0 && weekNum === target;
      const classes = [
        "session-checkbox-pill",
        isChecked ? "is-checked" : "",
        isTargetMarker ? "is-target-marker" : "",
      ]
        .filter(Boolean)
        .join(" ");

      return `<button
        type="button"
        class="${classes}"
        data-action="toggle-slot"
        data-id="${escapeHtml(item.id)}"
        data-slot="${idx}"
        aria-pressed="${isChecked ? "true" : "false"}"
        aria-label="Săptămâna ${weekNum} la ${escapeHtml(item.subject)} (${escapeHtml(item.type)}) — ${isChecked ? "Prezent" : "Neprezent"}"
        title="Săptămâna ${weekNum}${isTargetMarker ? " (Pragul minim setat)" : ""}"
      >
        <span>S${weekNum}</span>
        ${isChecked ? CHECK_SVG : ""}
      </button>`;
    })
    .join("");

  const remainingSummary = met
    ? `Obiectiv îndeplinit (${progressPct}%)`
    : target > 0
      ? `${progressPct}% din prag (${remaining} rămase)`
      : "Fără prag minim";

  return `<article class="activity-card ${met ? "card-completed" : ""}" data-card-id="${escapeHtml(item.id)}">
    <div class="card-top-row">
      <div class="card-badges">
        <span class="time-badge">${escapeHtml(item.time)}</span>
        <span class="type-badge ${typeClass}">${escapeHtml(item.type)}</span>
        <span class="room-badge">Sala ${escapeHtml(item.room)}</span>
      </div>
      ${statusBadgeHtml}
    </div>

    <div class="card-subject-block">
      <h3 class="card-subject-title">
        ${inlineTitleCheckHtml}
        <span>${escapeHtml(item.subject)}</span>
      </h3>
      <p class="card-professor">${escapeHtml(item.professor)} · ${escapeHtml(item.day)} (${escapeHtml(item.dateRef)})</p>
    </div>

    <div class="progress-block">
      <div class="progress-labels">
        <span class="progress-count-text ${met ? "is-met" : ""}">
          Prezențe: ${attended} / ${target}
        </span>
        <span class="progress-remaining-text">${escapeHtml(remainingSummary)}</span>
      </div>
      <div class="progress-track" role="progressbar" aria-valuenow="${attended}" aria-valuemin="0" aria-valuemax="${target || MAX_WEEKS}">
        <div class="progress-fill ${met ? "is-met" : ""}" style="width: ${progressPct}%"></div>
      </div>
    </div>

    <div class="card-actions-grid">
      <div class="attendance-stepper" role="group" aria-label="Modifică numărul de prezențe">
        <button
          type="button"
          class="btn-minus-attendance"
          data-action="decrement"
          data-id="${escapeHtml(item.id)}"
          aria-label="Scade o prezență la ${escapeHtml(item.subject)} (${escapeHtml(item.type)})"
          ${attended <= 0 ? "disabled" : ""}
        >
          &minus;
        </button>
        <button
          type="button"
          class="btn-plus-attendance"
          data-action="increment"
          data-id="${escapeHtml(item.id)}"
          aria-label="Adaugă o prezență la ${escapeHtml(item.subject)} (${escapeHtml(item.type)})"
          ${attended >= MAX_WEEKS ? "disabled" : ""}
        >
          ${PLUS_SVG}
          <span>Adaugă prezență</span>
        </button>
      </div>

      <div class="target-input-group" role="group" aria-label="Număr minim de prezențe cerut de profesor">
        <label class="target-label" for="target-input-${escapeHtml(item.id)}">Minim cerut:</label>
        <button
          type="button"
          class="btn-target-step"
          data-action="target-dec"
          data-id="${escapeHtml(item.id)}"
          aria-label="Scade pragul minim pentru ${escapeHtml(item.subject)} (${escapeHtml(item.type)})"
        >
          &minus;
        </button>
        <input
          type="number"
          id="target-input-${escapeHtml(item.id)}"
          class="target-number-input"
          min="0"
          max="${MAX_WEEKS}"
          value="${target}"
          data-action="target-input"
          data-id="${escapeHtml(item.id)}"
          aria-label="Număr minim prezențe pentru ${escapeHtml(item.subject)} (${escapeHtml(item.type)})"
        />
        <button
          type="button"
          class="btn-target-step"
          data-action="target-inc"
          data-id="${escapeHtml(item.id)}"
          aria-label="Crește pragul minim pentru ${escapeHtml(item.subject)} (${escapeHtml(item.type)})"
        >
          +
        </button>
      </div>
    </div>

    <div class="sessions-block">
      <div class="sessions-label-row">
        <span>Săptămâni (S1–S14):</span>
        <span>${attended} / ${MAX_WEEKS} bifate</span>
      </div>
      <div class="sessions-grid">
        ${slotsHtml}
      </div>
    </div>
  </article>`;
}

export function renderScheduleTable(items, state) {
  if (items.length === 0) {
    return `<div class="empty-filter-state">Nicio activitate nu corespunde filtrului selectat.</div>`;
  }

  const rowsHtml = items
    .map((item) => {
      const entry = state[item.id];
      const attended = Number(entry.attendedCount) || 0;
      const target = Number(entry.requiredTarget) || 0;
      const met = isTargetMet(attended, target);
      const typeClass =
        item.type === "SEMINAR" ? "type-badge-seminar" : "type-badge-curs";

      return `<tr class="${met ? "row-completed" : ""}">
        <th scope="row">${escapeHtml(item.day)}<br /><span class="day-date-ref">${escapeHtml(item.dateRef)}</span></th>
        <td><span class="time-badge">${escapeHtml(item.time)}</span></td>
        <td>
          <strong>${escapeHtml(item.subject)}</strong>
        </td>
        <td>${escapeHtml(item.professor)}</td>
        <td><span class="type-badge ${typeClass}">${escapeHtml(item.type)}</span></td>
        <td><span class="room-badge">${escapeHtml(item.room)}</span></td>
        <td>
          <div class="table-controls-cell">
            <button
              type="button"
              class="btn-minus-attendance"
              data-action="decrement"
              data-id="${escapeHtml(item.id)}"
              aria-label="Scade prezență la ${escapeHtml(item.subject)}"
              ${attended <= 0 ? "disabled" : ""}
            >&minus;</button>
            <button
              type="button"
              class="btn-plus-attendance"
              data-action="increment"
              data-id="${escapeHtml(item.id)}"
              aria-label="Adaugă prezență la ${escapeHtml(item.subject)}"
              ${attended >= MAX_WEEKS ? "disabled" : ""}
            >${PLUS_SVG}<span>+${attended}/${target}</span></button>
            <div class="target-input-group">
              <label class="target-label" for="tbl-target-${escapeHtml(item.id)}">Prag:</label>
              <input
                type="number"
                id="tbl-target-${escapeHtml(item.id)}"
                class="target-number-input"
                min="0"
                max="${MAX_WEEKS}"
                value="${target}"
                data-action="target-input"
                data-id="${escapeHtml(item.id)}"
                aria-label="Prag minim pentru ${escapeHtml(item.subject)}"
              />
            </div>
            ${
              met
                ? `<span class="green-check-badge"><span class="green-check-icon">${CHECK_SVG}</span><span>Bifă verde</span></span>`
                : `<span class="pending-status-badge">Mai trebuie ${Math.max(0, target - attended)}</span>`
            }
          </div>
        </td>
      </tr>`;
    })
    .join("");

  return `<div tabindex="0" role="region" aria-labelledby="schedule-table-caption" class="table-wrapper">
    <table class="schedule-table">
      <caption id="schedule-table-caption">Orar oficial Luni–Vineri (19/10/2026 – 23/10/2026) — Evidență interactivă prezențe</caption>
      <thead>
        <tr>
          <th scope="col">Ziua</th>
          <th scope="col">Ora</th>
          <th scope="col">Curs / Disciplină</th>
          <th scope="col">Cadru Didactic</th>
          <th scope="col">Tip Activitate</th>
          <th scope="col">Sala</th>
          <th scope="col">Prezențe &amp; Prag Minim</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml}
      </tbody>
    </table>
  </div>`;
}

function renderSubjectsView(items, state) {
  if (items.length === 0) {
    return `<div class="empty-filter-state">Nicio materie nu corespunde filtrului selectat.</div>`;
  }

  const subjectsMap = new Map();
  for (const item of items) {
    if (!subjectsMap.has(item.subject)) {
      subjectsMap.set(item.subject, []);
    }
    subjectsMap.get(item.subject).push(item);
  }

  let html = "";
  for (const [subjectName, groupItems] of subjectsMap.entries()) {
    const completedInGroup = groupItems.filter((it) =>
      isTargetMet(state[it.id].attendedCount, state[it.id].requiredTarget)
    ).length;

    html += `<section class="day-section">
      <div class="day-section-header">
        <div class="day-title-group">
          <h2 class="day-section-title">${escapeHtml(subjectName)}</h2>
        </div>
        <span class="day-summary-meta">${completedInGroup} / ${groupItems.length} cu bifă verde</span>
      </div>
      <div class="day-cards-grid">
        ${groupItems.map((it) => renderActivityCard(it, state[it.id])).join("")}
      </div>
    </section>`;
  }

  return html;
}

function renderDaysView(items, state, selectedDay) {
  if (items.length === 0) {
    return `<div class="empty-filter-state">Nicio activitate nu corespunde filtrului selectat.</div>`;
  }

  const daysToShow =
    selectedDay === "all"
      ? DAYS_ORDER
      : DAYS_ORDER.filter((d) => d === selectedDay);

  let html = "";
  for (const dayName of daysToShow) {
    const dayItems = items.filter((it) => it.day === dayName);
    if (dayItems.length === 0) continue;

    const completedOnDay = dayItems.filter((it) =>
      isTargetMet(state[it.id].attendedCount, state[it.id].requiredTarget)
    ).length;

    html += `<section class="day-section" data-day-section="${escapeHtml(dayName)}">
      <div class="day-section-header">
        <div class="day-title-group">
          <h2 class="day-section-title">${escapeHtml(dayName)}</h2>
          <span class="day-date-ref">${escapeHtml(DAY_DATES[dayName] || "")}</span>
        </div>
        <span class="day-summary-meta">${completedOnDay} / ${dayItems.length} cu bifă verde</span>
      </div>
      <div class="day-cards-grid">
        ${dayItems.map((it) => renderActivityCard(it, state[it.id])).join("")}
      </div>
    </section>`;
  }

  return html;
}

export function renderApp(uiState) {
  if (typeof document === "undefined") return;

  const { state, activeFilter, activeView, activeDay } = uiState;
  const stats = computeDashboardStats(state);

  // Update KPI Strip
  const statCompletedEl = document.getElementById("stat-completed");
  const statCompletedPctEl = document.getElementById("stat-completed-percent");
  const statRemainingEl = document.getElementById("stat-remaining-activities");
  const statTotalAttEl = document.getElementById("stat-total-attendances");
  const statTotalReqEl = document.getElementById("stat-total-required");
  const statSeminarsEl = document.getElementById("stat-seminars");
  const statCoursesEl = document.getElementById("stat-courses");
  const headlineFindingEl = document.getElementById("headline-finding");

  if (statCompletedEl) {
    statCompletedEl.textContent = `${stats.completedActivities} / ${stats.totalActivities}`;
  }
  if (statCompletedPctEl) {
    statCompletedPctEl.textContent = `${stats.overallCompletionPercent}% complet`;
  }
  if (statRemainingEl) {
    const rem = stats.totalActivities - stats.completedActivities;
    statRemainingEl.textContent =
      rem === 0
        ? "Toate cele 13 activități au bifa verde!"
        : `${rem} activități mai au nevoie de prezențe`;
  }
  if (statTotalAttEl) {
    statTotalAttEl.textContent = String(stats.totalAttendances);
  }
  if (statTotalReqEl) {
    statTotalReqEl.textContent = `din ${stats.totalRequired} necesare`;
  }
  if (statSeminarsEl) {
    statSeminarsEl.textContent = `${stats.completedSeminars} / ${stats.totalSeminars}`;
  }
  if (statCoursesEl) {
    statCoursesEl.textContent = `${stats.completedCourses} / ${stats.totalCourses}`;
  }
  if (headlineFindingEl) {
    if (stats.completedActivities === stats.totalActivities) {
      headlineFindingEl.textContent =
        "Felicitări! Ai atins numărul minim de prezențe (Bifă verde) la toate cele 13 cursuri și seminare.";
    } else {
      headlineFindingEl.textContent = `${stats.completedActivities} din ${stats.totalActivities} activități au bifa verde activă · ${stats.totalAttendances} prezențe acumulate în total.`;
    }
  }

  // Update Filter Counts
  const countAllEl = document.getElementById("count-all");
  const countSemEl = document.getElementById("count-seminar");
  const countCursEl = document.getElementById("count-curs");
  const countCompEl = document.getElementById("count-completed");
  const countPendEl = document.getElementById("count-pending");

  if (countAllEl) countAllEl.textContent = String(stats.totalActivities);
  if (countSemEl) countSemEl.textContent = String(stats.totalSeminars);
  if (countCursEl) countCursEl.textContent = String(stats.totalCourses);
  if (countCompEl) countCompEl.textContent = String(stats.completedActivities);
  if (countPendEl) {
    countPendEl.textContent = String(
      stats.totalActivities - stats.completedActivities
    );
  }

  // Filter items
  const filteredItems = INITIAL_SCHEDULE.filter((item) => {
    if (activeDay !== "all" && item.day !== activeDay) return false;
    const entry = state[item.id];
    const met = isTargetMet(entry.attendedCount, entry.requiredTarget);

    if (activeFilter === "SEMINAR") return item.type === "SEMINAR";
    if (activeFilter === "CURS") return item.type === "CURS";
    if (activeFilter === "completed") return met;
    if (activeFilter === "pending") return !met;
    return true;
  });

  // Render active view
  const rootEl = document.getElementById("schedule-root");
  if (rootEl) {
    if (activeView === "calendar") {
      rootEl.style.display = "none";
      rootEl.innerHTML = "";
    } else {
      rootEl.style.display = "";
      if (activeView === "table") {
        rootEl.innerHTML = renderScheduleTable(filteredItems, state);
      } else if (activeView === "subjects") {
        rootEl.innerHTML = renderSubjectsView(filteredItems, state);
      } else {
        rootEl.innerHTML = renderDaysView(filteredItems, state, activeDay);
      }
    }
  }

  renderCalendarSection(uiState);
}

function formatDateRo(isoDate) {
  if (!isoDate) return "";
  const [y, m, d] = String(isoDate).split("-").map(Number);
  if (!y || !m || !d) return isoDate;
  const dateObj = new Date(y, m - 1, d);
  return dateObj.toLocaleDateString("ro-RO", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function getDaysRemainingBadge(isoDate, completed) {
  if (completed) {
    return `<span class="green-check-badge"><span class="green-check-icon" aria-hidden="true">${CHECK_SVG}</span><span>Bifă verde — Finalizat</span></span>`;
  }
  const [y, m, d] = String(isoDate).split("-").map(Number);
  if (!y || !m || !d) return "";
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetMidnight = new Date(y, m - 1, d);
  const diffDays = Math.round((targetMidnight - todayMidnight) / 86400000);

  if (diffDays === 0) {
    return `<span class="cal-countdown-pill is-urgent">Azi!</span>`;
  }
  if (diffDays === 1) {
    return `<span class="cal-countdown-pill is-soon">Mâine</span>`;
  }
  if (diffDays > 1 && diffDays <= 7) {
    return `<span class="cal-countdown-pill is-soon">Peste ${diffDays} zile</span>`;
  }
  if (diffDays > 7) {
    return `<span class="cal-countdown-pill">Peste ${diffDays} zile</span>`;
  }
  return `<span class="cal-countdown-pill is-past">Termen depășit (${Math.abs(diffDays)} zile)</span>`;
}

function getCalendarTypeLabel(type) {
  if (type === "PROIECT") return "PROIECT";
  if (type === "COLOCVIU") return "COLOCVIU / PARȚIAL";
  if (type === "TEMA") return "TEMĂ / PREZENTARE";
  return "EXAMEN";
}

export function renderCalendarSection(uiState) {
  if (typeof document === "undefined") return;
  const calRoot = document.getElementById("exam-calendar-root");
  const calendarItems = Array.isArray(uiState.calendarItems)
    ? uiState.calendarItems
    : loadCalendarItems();
  uiState.calendarItems = calendarItems;

  const pendingCount = calendarItems.filter((it) => !it.completed).length;
  const completedCount = calendarItems.filter((it) => it.completed).length;

  const navCalCount = document.getElementById("nav-calendar-count");
  if (navCalCount) navCalCount.textContent = String(pendingCount);
  const viewCalCount = document.getElementById("view-calendar-count");
  if (viewCalCount) viewCalCount.textContent = String(pendingCount);

  if (!calRoot) return;

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;

  const viewYear = Number.isFinite(uiState.calYear) ? uiState.calYear : now.getFullYear();
  const viewMonth = Number.isFinite(uiState.calMonth) ? uiState.calMonth : now.getMonth();
  const selectedDate = uiState.calSelectedDate || todayIso;
  const calFilter = uiState.calFilter || "all";

  const firstDayOfMonth = new Date(viewYear, viewMonth, 1);
  // Convert Sunday=0..Saturday=6 into Monday=0..Sunday=6
  const startOffset = (firstDayOfMonth.getDay() + 6) % 7;
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const itemsByDate = new Map();
  for (const item of calendarItems) {
    if (!itemsByDate.has(item.date)) itemsByDate.set(item.date, []);
    itemsByDate.get(item.date).push(item);
  }

  let dayCellsHtml = "";
  for (let i = 0; i < startOffset; i += 1) {
    dayCellsHtml += `<div class="cal-day-cell is-empty" aria-hidden="true"></div>`;
  }

  for (let dayNum = 1; dayNum <= daysInMonth; dayNum += 1) {
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
    const dayEvents = itemsByDate.get(iso) || [];
    const isToday = iso === todayIso;
    const isSelected = iso === selectedDate;
    const hasPending = dayEvents.some((ev) => !ev.completed);

    const pillsHtml = dayEvents
      .slice(0, 3)
      .map((ev) => {
        const cls = ev.completed
          ? "is-done"
          : ev.type === "PROIECT"
          ? "is-project"
          : ev.type === "COLOCVIU"
          ? "is-colocviu"
          : "is-exam";
        return `<span class="cal-day-pill ${cls}" title="${escapeHtml(ev.subject)}: ${escapeHtml(ev.title)}">${escapeHtml(
          ev.title
        )}</span>`;
      })
      .join("");

    const moreHtml =
      dayEvents.length > 3
        ? `<span class="cal-day-more">+${dayEvents.length - 3} altele</span>`
        : "";

    dayCellsHtml += `
      <button
        type="button"
        class="cal-day-cell${isToday ? " is-today" : ""}${isSelected ? " is-selected" : ""}${
          hasPending ? " has-events" : ""
        }"
        data-cal-action="select-date"
        data-date="${iso}"
        aria-label="Selectează data ${iso} (${dayEvents.length} examene sau proiecte)"
      >
        <div class="cal-day-top">
          <span class="cal-day-number">${dayNum}</span>
          ${dayEvents.length > 0 ? `<span class="cal-day-count">${dayEvents.length}</span>` : ""}
        </div>
        <div class="cal-day-events">${pillsHtml}${moreHtml}</div>
      </button>
    `;
  }

  const filteredList = calendarItems.filter((it) => {
    if (calFilter === "pending") return !it.completed;
    if (calFilter === "completed") return it.completed;
    if (calFilter === "EXAMEN") return it.type === "EXAMEN" || it.type === "COLOCVIU";
    if (calFilter === "PROIECT") return it.type === "PROIECT" || it.type === "TEMA";
    return true;
  });

  const agendaHtml =
    filteredList.length === 0
      ? `<div class="cal-empty-box">Nu ai niciun examen sau proiect în această listă. Selectează o zi din calendar și adaugă rapid în formularul de mai sus!</div>`
      : filteredList
          .map((it) => {
            const typeBadgeClass =
              it.type === "PROIECT" || it.type === "TEMA" ? "type-seminar" : "type-curs";
            return `
              <article class="cal-item-card${it.completed ? " card-completed" : ""}">
                <div class="cal-item-main">
                  <div class="cal-item-badges">
                    <span class="type-pill ${typeBadgeClass}">${escapeHtml(
                      getCalendarTypeLabel(it.type)
                    )}</span>
                    <span class="cal-date-chip">${escapeHtml(formatDateRo(it.date))}</span>
                    ${it.meta ? `<span class="room-chip">${escapeHtml(it.meta)}</span>` : ""}
                    ${getDaysRemainingBadge(it.date, it.completed)}
                  </div>
                  <h4 class="cal-item-title">${escapeHtml(it.title)}</h4>
                  <p class="cal-item-subject">Materie: <strong>${escapeHtml(it.subject)}</strong></p>
                </div>
                <div class="cal-item-actions">
                  <button
                    type="button"
                    class="${it.completed ? "btn-outline-sm" : "btn-plus-attendance"}"
                    data-cal-action="toggle-complete"
                    data-id="${escapeHtml(it.id)}"
                  >
                    ${
                      it.completed
                        ? "Anulează bifa"
                        : `${CHECK_SVG}<span>Bifează finalizat</span>`
                    }
                  </button>
                  <button
                    type="button"
                    class="btn-cal-delete"
                    data-cal-action="delete-item"
                    data-id="${escapeHtml(it.id)}"
                    aria-label="Șterge ${escapeHtml(it.title)}"
                  >
                    Șterge
                  </button>
                </div>
              </article>
            `;
          })
          .join("");

  const subjectOptionsHtml = SUBJECT_OPTIONS.map(
    (subj) => `<option value="${escapeHtml(subj)}">${escapeHtml(subj)}</option>`
  ).join("");

  calRoot.innerHTML = `
    <div class="cal-shell-card">
      <div class="cal-header-row">
        <div>
          <h2 class="cal-section-title">Calendar Examene, Proiecte &amp; Colocvii</h2>
          <p class="cal-section-subtitle">
            Dă click pe orice zi din calendar pentru a nota rapid un examen sau proiect. Rămase: <strong>${pendingCount}</strong> · Finalizate cu bifă verde: <strong>${completedCount}</strong>
          </p>
        </div>
        <div class="cal-filter-row" role="group" aria-label="Filtre examene și proiecte">
          <button type="button" class="filter-pill ${calFilter === "all" ? "active" : ""}" data-cal-filter="all">
            Toate (${calendarItems.length})
          </button>
          <button type="button" class="filter-pill ${calFilter === "pending" ? "active" : ""}" data-cal-filter="pending">
            Mai am de susținut (${pendingCount})
          </button>
          <button type="button" class="filter-pill ${calFilter === "EXAMEN" ? "active" : ""}" data-cal-filter="EXAMEN">
            Examene / Colocvii
          </button>
          <button type="button" class="filter-pill ${calFilter === "PROIECT" ? "active" : ""}" data-cal-filter="PROIECT">
            Proiecte / Teme
          </button>
          <button type="button" class="filter-pill filter-pill-green ${
            calFilter === "completed" ? "active" : ""
          }" data-cal-filter="completed">
            Finalizate (${completedCount})
          </button>
        </div>
      </div>

      <div class="cal-workspace-grid">
        <!-- Left: Monthly Interactive Calendar -->
        <div class="cal-month-panel">
          <div class="cal-month-toolbar">
            <button type="button" class="btn-outline-sm" data-cal-action="prev-month" aria-label="Luna anterioară">
              Luna anterioară
            </button>
            <strong class="cal-month-label">${ROMANIAN_MONTHS[viewMonth]} ${viewYear}</strong>
            <div class="cal-month-nav-right">
              <button type="button" class="btn-outline-sm" data-cal-action="today-month">Azi</button>
              <button type="button" class="btn-outline-sm" data-cal-action="next-month" aria-label="Luna următoare">
                Luna următoare
              </button>
            </div>
          </div>

          <div class="cal-weekdays-grid" aria-hidden="true">
            <span>Lu</span><span>Ma</span><span>Mi</span><span>Jo</span><span>Vi</span><span>Sâ</span><span>Du</span>
          </div>
          <div class="cal-days-grid">
            ${dayCellsHtml}
          </div>
        </div>

        <!-- Right: Quick Add Form + Agenda List -->
        <div class="cal-agenda-panel">
          <form class="cal-quick-form" id="cal-quick-form">
            <h3 class="cal-form-title">Adaugă rapid examen sau proiect</h3>
            <div class="cal-form-row-2">
              <div class="cloud-field">
                <label for="cal-input-type">Tip activitate:</label>
                <select id="cal-input-type" class="cloud-input">
                  <option value="EXAMEN">Examen</option>
                  <option value="PROIECT">Proiect / Referat</option>
                  <option value="COLOCVIU">Colocviu / Parțial</option>
                  <option value="TEMA">Temă / Prezentare</option>
                </select>
              </div>
              <div class="cloud-field">
                <label for="cal-input-subject">Materia:</label>
                <select id="cal-input-subject" class="cloud-input">
                  ${subjectOptionsHtml}
                </select>
              </div>
            </div>

            <div class="cloud-field">
              <label for="cal-input-title">Ce ai de pregătit / notat:</label>
              <input
                type="text"
                id="cal-input-title"
                class="cloud-input"
                placeholder="ex: Predare proiect Marketing sau Examen final Drept"
                required
              />
            </div>

            <div class="cal-form-row-2">
              <div class="cloud-field">
                <label for="cal-input-date">Data (sau dă click în calendar):</label>
                <input
                  type="date"
                  id="cal-input-date"
                  class="cloud-input"
                  value="${escapeHtml(selectedDate)}"
                  required
                />
              </div>
              <div class="cloud-field">
                <label for="cal-input-meta">Ora / Sala (opțional):</label>
                <input
                  type="text"
                  id="cal-input-meta"
                  class="cloud-input"
                  placeholder="ex: 09:00 · Sala 2202"
                />
              </div>
            </div>

            <button type="submit" class="btn-plus-attendance cal-submit-btn">
              ${PLUS_SVG}
              <span>Adaugă în calendar</span>
            </button>
          </form>

          <div class="cal-agenda-list-wrap">
            <h3 class="cal-form-title">Lista examenelor și proiectelor (${filteredList.length})</h3>
            <div class="cal-agenda-list">
              ${agendaHtml}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function initBrowserApp() {
  if (typeof document === "undefined") return;
  if (typeof window !== "undefined") {
    if (window.__PREZENTE_APP_BOOTED__) return;
    window.__PREZENTE_APP_BOOTED__ = true;
  }

  const now = new Date();
  const todayIso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;

  const uiState = {
    state: loadState(),
    calendarItems: loadCalendarItems(),
    activeFilter: "all",
    activeView: "days",
    activeDay: "all",
    calYear: now.getFullYear(),
    calMonth: now.getMonth(),
    calSelectedDate: todayIso,
    calFilter: "all",
  };

  const syncViewButtons = () => {
    document.querySelectorAll("[data-view]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === uiState.activeView);
    });
    document.querySelectorAll("[data-view-btn]").forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.dataset.viewBtn === uiState.activeView
      );
    });
  };

  const syncDayButtons = () => {
    document.querySelectorAll("[data-day]").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.day === uiState.activeDay);
    });
  };

  const syncFilterButtons = () => {
    document.querySelectorAll("[data-filter]").forEach((btn) => {
      btn.classList.toggle(
        "active",
        btn.dataset.filter === uiState.activeFilter
      );
    });
  };

  // Event delegation for schedule-root actions (+, -, slots, target stepper)
  const rootEl = document.getElementById("schedule-root");
  if (rootEl) {
    rootEl.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-action]");
      if (!btn) return;

      const action = btn.dataset.action;
      const id = btn.dataset.id;
      if (!id || !uiState.state[id]) return;

      if (action === "increment") {
        uiState.state = incrementAttendance(uiState.state, id);
        saveState(uiState.state);
        renderApp(uiState);
      } else if (action === "decrement") {
        uiState.state = decrementAttendance(uiState.state, id);
        saveState(uiState.state);
        renderApp(uiState);
      } else if (action === "toggle-slot") {
        const slotIdx = Number(btn.dataset.slot);
        uiState.state = toggleSessionSlot(uiState.state, id, slotIdx);
        saveState(uiState.state);
        renderApp(uiState);
      } else if (action === "target-dec") {
        const currentTarget = uiState.state[id].requiredTarget;
        uiState.state = setRequiredTarget(
          uiState.state,
          id,
          Math.max(0, currentTarget - 1)
        );
        saveState(uiState.state);
        renderApp(uiState);
      } else if (action === "target-inc") {
        const currentTarget = uiState.state[id].requiredTarget;
        uiState.state = setRequiredTarget(
          uiState.state,
          id,
          Math.min(MAX_WEEKS, currentTarget + 1)
        );
        saveState(uiState.state);
        renderApp(uiState);
      }
    });

    rootEl.addEventListener("change", (event) => {
      const input = event.target.closest('input[data-action="target-input"]');
      if (!input) return;
      const id = input.dataset.id;
      if (!id || !uiState.state[id]) return;

      uiState.state = setRequiredTarget(uiState.state, id, input.value);
      saveState(uiState.state);
      renderApp(uiState);
    });
  }

  // Filter pills
  document.querySelectorAll("[data-filter]").forEach((btn) => {
    btn.addEventListener("click", () => {
      uiState.activeFilter = btn.dataset.filter || "all";
      syncFilterButtons();
      renderApp(uiState);
    });
  });

  // View switchers (sidebar & toolbar)
  document.querySelectorAll("[data-view], [data-view-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const nextView = btn.dataset.view || btn.dataset.viewBtn || "days";
      uiState.activeView = nextView;
      syncViewButtons();
      renderApp(uiState);
    });
  });

  // Day filters (sidebar & mobile strip)
  document.querySelectorAll("[data-day]").forEach((btn) => {
    btn.addEventListener("click", () => {
      uiState.activeDay = btn.dataset.day || "all";
      syncDayButtons();
      renderApp(uiState);
    });
  });

  // Bulk apply seminar target
  const btnApplySeminarTarget = document.getElementById(
    "btn-apply-seminar-target"
  );
  const bulkSeminarInput = document.getElementById("bulk-seminar-target");
  if (btnApplySeminarTarget && bulkSeminarInput) {
    btnApplySeminarTarget.addEventListener("click", () => {
      const val = Number(bulkSeminarInput.value);
      let nextState = { ...uiState.state };
      for (const item of INITIAL_SCHEDULE) {
        if (item.type === "SEMINAR") {
          nextState = setRequiredTarget(nextState, item.id, val);
        }
      }
      uiState.state = nextState;
      saveState(uiState.state);
      renderApp(uiState);
    });
  }

  // Reset attendances (keeping customized professor targets intact)
  const btnReset = document.getElementById("btn-reset-attendances");
  if (btnReset) {
    btnReset.addEventListener("click", () => {
      const confirmed = window.confirm(
        "Sigur vrei să resetezi toate prezențele bifate la 0? (Numerele minime setate la profesori vor rămâne salvate.)"
      );
      if (!confirmed) return;

      const nextState = {};
      for (const item of INITIAL_SCHEDULE) {
        const prev = uiState.state[item.id];
        nextState[item.id] = {
          attendedCount: 0,
          requiredTarget: prev ? prev.requiredTarget : item.defaultRequired,
          checkedSlots: new Array(MAX_WEEKS).fill(false),
          lastUpdated: new Date().toISOString(),
        };
      }
      uiState.state = nextState;
      saveState(uiState.state);
      renderApp(uiState);
    });
  }

  // Calendar Examene & Proiecte event delegation
  const calRootEl = document.getElementById("exam-calendar-root");
  if (calRootEl) {
    calRootEl.addEventListener("click", (event) => {
      const filterBtn = event.target.closest("[data-cal-filter]");
      if (filterBtn) {
        uiState.calFilter = filterBtn.dataset.calFilter || "all";
        renderCalendarSection(uiState);
        return;
      }

      const actionBtn = event.target.closest("[data-cal-action]");
      if (!actionBtn) return;
      const calAction = actionBtn.dataset.calAction;

      if (calAction === "prev-month") {
        if (uiState.calMonth === 0) {
          uiState.calMonth = 11;
          uiState.calYear -= 1;
        } else {
          uiState.calMonth -= 1;
        }
        renderCalendarSection(uiState);
      } else if (calAction === "next-month") {
        if (uiState.calMonth === 11) {
          uiState.calMonth = 0;
          uiState.calYear += 1;
        } else {
          uiState.calMonth += 1;
        }
        renderCalendarSection(uiState);
      } else if (calAction === "today-month") {
        const current = new Date();
        uiState.calYear = current.getFullYear();
        uiState.calMonth = current.getMonth();
        uiState.calSelectedDate = `${current.getFullYear()}-${String(
          current.getMonth() + 1
        ).padStart(2, "0")}-${String(current.getDate()).padStart(2, "0")}`;
        renderCalendarSection(uiState);
      } else if (calAction === "select-date") {
        const dateVal = actionBtn.dataset.date;
        if (dateVal) {
          uiState.calSelectedDate = dateVal;
          renderCalendarSection(uiState);
          const titleInput = document.getElementById("cal-input-title");
          if (titleInput) titleInput.focus();
        }
      } else if (calAction === "toggle-complete") {
        const id = actionBtn.dataset.id;
        if (id) {
          uiState.calendarItems = toggleCalendarItem(uiState.calendarItems, id);
          saveCalendarItems(uiState.calendarItems, uiState.state);
          renderCalendarSection(uiState);
        }
      } else if (calAction === "delete-item") {
        const id = actionBtn.dataset.id;
        if (id) {
          uiState.calendarItems = deleteCalendarItem(uiState.calendarItems, id);
          saveCalendarItems(uiState.calendarItems, uiState.state);
          renderCalendarSection(uiState);
        }
      }
    });

    calRootEl.addEventListener("submit", (event) => {
      const form = event.target.closest("#cal-quick-form");
      if (!form) return;
      event.preventDefault();

      const typeEl = document.getElementById("cal-input-type");
      const subjectEl = document.getElementById("cal-input-subject");
      const titleEl = document.getElementById("cal-input-title");
      const dateEl = document.getElementById("cal-input-date");
      const metaEl = document.getElementById("cal-input-meta");

      const title = titleEl ? titleEl.value.trim() : "";
      const date = dateEl ? dateEl.value : uiState.calSelectedDate;
      if (!title || !date) return;

      uiState.calendarItems = addCalendarItem(uiState.calendarItems, {
        type: typeEl ? typeEl.value : "EXAMEN",
        subject: subjectEl ? subjectEl.value : SUBJECT_OPTIONS[0],
        title,
        date,
        meta: metaEl ? metaEl.value.trim() : "",
      });

      const [yr, mo] = date.split("-").map(Number);
      if (yr && mo) {
        uiState.calYear = yr;
        uiState.calMonth = mo - 1;
      }
      uiState.calSelectedDate = date;

      saveCalendarItems(uiState.calendarItems, uiState.state);
      renderCalendarSection(uiState);
    });
  }

  // Check if URL contains a Magic Sync payload (?sync=... or #sync=...)
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const syncCode = searchParams.get("sync") || hashParams.get("sync");
    if (syncCode) {
      const decoded = decodeCompactSync(syncCode);
      if (decoded) {
        uiState.state = decoded;
        saveState(uiState.state);
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }
    }
  } catch {
    // Ignore malformed URL parameters
  }

  // Cloud Sync UI & Real-Time Sync Wiring
  const cloudDialog = document.getElementById("cloud-sync-dialog");
  const btnOpenCloud = document.getElementById("btn-open-cloud-sync");
  const btnCloseCloud = document.getElementById("btn-close-cloud-sync");
  const cloudBadgeDot = document.getElementById("cloud-badge-dot");
  const cloudBtnLabel = document.getElementById("cloud-btn-label");
  const cloudModalStatus = document.getElementById("cloud-modal-status");
  const inputDbUrl = document.getElementById("cloud-db-url");
  const inputSyncPin = document.getElementById("cloud-sync-pin");
  const btnSaveCloud = document.getElementById("btn-save-cloud-config");
  const btnPullCloud = document.getElementById("btn-pull-cloud");
  const btnDisconnectCloud = document.getElementById("btn-disconnect-cloud");
  const btnCopyMagicLink = document.getElementById("btn-copy-magic-link");
  const btnExportJson = document.getElementById("btn-export-json");
  const btnImportJson = document.getElementById("btn-import-json");
  const inputImportJson = document.getElementById("input-import-json");

  const updateCloudStatusUI = (customMsg = "") => {
    const { dbUrl, pin } = loadCloudConfig();
    const isConnected = Boolean(dbUrl && pin);
    if (btnOpenCloud) btnOpenCloud.classList.toggle("is-connected", isConnected);
    if (cloudBadgeDot) cloudBadgeDot.classList.toggle("is-connected", isConnected);
    if (cloudBtnLabel) {
      cloudBtnLabel.textContent = isConnected
        ? `Cloud Activ (${pin})`
        : "Sincronizare Cloud & Hosting";
    }
    if (cloudModalStatus) {
      cloudModalStatus.classList.toggle("is-connected", isConnected);
      if (customMsg) {
        cloudModalStatus.textContent = customMsg;
      } else if (isConnected) {
        cloudModalStatus.textContent = `Conectat la Cloud (PIN: ${pin}). Orice modificare este sincronizată automat între telefon și laptop.`;
      } else {
        cloudModalStatus.textContent =
          "Mod actual: Salvare locală în browser (localStorage). Conectează un URL Cloud mai jos pentru sincronizare automată telefon ↔ laptop.";
      }
    }
    if (inputDbUrl && !inputDbUrl.value && dbUrl) inputDbUrl.value = dbUrl;
    if (inputSyncPin && !inputSyncPin.value && pin) inputSyncPin.value = pin;
  };

  const syncFromCloudNow = async (showFeedback = false) => {
    const { dbUrl, pin } = loadCloudConfig();
    if (!dbUrl || !pin) return;
    const remoteState = await pullStateFromCloud();
    if (remoteState) {
      uiState.state = remoteState;
      uiState.calendarItems = loadCalendarItems();
      saveState(uiState.state, { syncCloud: false });
      renderApp(uiState);
      if (showFeedback) {
        updateCloudStatusUI(
          `Prezențele și calendarul au fost preluate din Cloud (${new Date().toLocaleTimeString("ro-RO")}).`
        );
      }
    } else if (showFeedback) {
      await pushStateToCloud(uiState.state, uiState.calendarItems);
      updateCloudStatusUI(
        `Prezențele și calendarul au fost salvate în Cloud pe PIN-ul "${pin}" (${new Date().toLocaleTimeString("ro-RO")}).`
      );
    }
  };

  if (btnOpenCloud && cloudDialog) {
    btnOpenCloud.addEventListener("click", () => {
      const { dbUrl, pin } = loadCloudConfig();
      if (inputDbUrl) inputDbUrl.value = dbUrl;
      if (inputSyncPin) inputSyncPin.value = pin;
      updateCloudStatusUI();
      if (typeof cloudDialog.showModal === "function") {
        cloudDialog.showModal();
      } else {
        cloudDialog.setAttribute("open", "open");
      }
    });
  }

  if (btnCloseCloud && cloudDialog) {
    btnCloseCloud.addEventListener("click", () => {
      if (typeof cloudDialog.close === "function") {
        cloudDialog.close();
      } else {
        cloudDialog.removeAttribute("open");
      }
    });
  }

  if (btnSaveCloud) {
    btnSaveCloud.addEventListener("click", async () => {
      const dbUrl = inputDbUrl ? inputDbUrl.value.trim() : "";
      const pin = inputSyncPin ? inputSyncPin.value.trim() : "";
      if (!dbUrl || !pin) {
        updateCloudStatusUI("Completează atât URL-ul bazei de date, cât și codul PIN personal.");
        return;
      }
      saveCloudConfig({ dbUrl, pin });
      updateCloudStatusUI("Se conectează și se sincronizează cu Cloud-ul...");
      const remoteState = await pullStateFromCloud();
      if (remoteState) {
        uiState.state = remoteState;
        uiState.calendarItems = loadCalendarItems();
        saveState(uiState.state, { syncCloud: false });
        renderApp(uiState);
        updateCloudStatusUI(`Conectat! Datele existente din Cloud pentru PIN-ul "${pin}" au fost încărcate.`);
      } else {
        const ok = await pushStateToCloud(uiState.state, uiState.calendarItems);
        updateCloudStatusUI(
          ok
            ? `Conectat! Prezențele și calendarul tău au fost salvate în Cloud (PIN: ${pin}).`
            : "Nu s-a putut accesa URL-ul Cloud. Verifică dacă baza Firebase Realtime DB este în Test Mode."
        );
      }
    });
  }

  if (btnPullCloud) {
    btnPullCloud.addEventListener("click", () => {
      syncFromCloudNow(true);
    });
  }

  if (btnDisconnectCloud) {
    btnDisconnectCloud.addEventListener("click", () => {
      saveCloudConfig({ dbUrl: "", pin: "" });
      if (inputDbUrl) inputDbUrl.value = "";
      if (inputSyncPin) inputSyncPin.value = "";
      updateCloudStatusUI("Sincronizarea Cloud a fost deconectată. Datele rămân salvate local.");
    });
  }

  if (btnCopyMagicLink) {
    btnCopyMagicLink.addEventListener("click", async () => {
      const code = encodeCompactSync(uiState.state);
      const baseUrl = window.location.href.split("?")[0].split("#")[0];
      const magicUrl = `${baseUrl}?sync=${encodeURIComponent(code)}`;
      try {
        await navigator.clipboard.writeText(magicUrl);
        updateCloudStatusUI("Link-ul cu toate prezențele tale a fost copiat în Clipboard! Trimite-l pe telefon și deschide-l.");
      } catch {
        window.prompt("Copiază acest link pentru a-ți deschide prezențele pe alt dispozitiv:", magicUrl);
      }
    });
  }

  if (btnExportJson) {
    btnExportJson.addEventListener("click", () => {
      const payload = JSON.stringify(
        { state: uiState.state, calendarItems: uiState.calendarItems },
        null,
        2
      );
      const blob = new Blob([payload], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `prezente-facultate-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      updateCloudStatusUI("Fișierul de backup (.json) a fost descărcat.");
    });
  }

  if (btnImportJson && inputImportJson) {
    btnImportJson.addEventListener("click", () => inputImportJson.click());
    inputImportJson.addEventListener("change", async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const rawState = parsed.state && typeof parsed.state === "object" ? parsed.state : parsed;
        uiState.state = createInitialState(rawState);
        if (Array.isArray(parsed.calendarItems)) {
          uiState.calendarItems = saveCalendarItems(parsed.calendarItems, uiState.state, {
            syncCloud: false,
          });
        }
        saveState(uiState.state);
        renderApp(uiState);
        updateCloudStatusUI("Backup-ul (.json) a fost încărcat și salvat cu succes!");
      } catch {
        updateCloudStatusUI("Fișierul selectat nu este un backup JSON valid.");
      }
    });
  }

  updateCloudStatusUI();
  syncFromCloudNow(false);

  window.addEventListener("focus", () => {
    syncFromCloudNow(false);
  });

  renderApp(uiState);
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initBrowserApp);
  } else {
    initBrowserApp();
  }
}
