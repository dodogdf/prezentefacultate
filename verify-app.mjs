import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  INITIAL_SCHEDULE,
  DAYS_ORDER,
  createInitialState,
  isTargetMet,
  incrementAttendance,
  decrementAttendance,
  toggleSessionSlot,
  setRequiredTarget,
  computeDashboardStats,
} from "./schedule-data.js";
import { renderActivityCard, renderScheduleTable } from "./app.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Verify all 13 timetable activities match the uploaded schedule screenshot
assert.equal(
  INITIAL_SCHEDULE.length,
  13,
  "INITIAL_SCHEDULE must contain all 13 courses and seminars from the timetable screenshot"
);

const seminars = INITIAL_SCHEDULE.filter((item) => item.type === "SEMINAR");
const courses = INITIAL_SCHEDULE.filter((item) => item.type === "CURS");
assert.equal(seminars.length, 7, "Must contain exactly 7 SEMINAR activities");
assert.equal(courses.length, 6, "Must contain exactly 6 CURS activities");

// Verify per-day counts (Luni: 3, Marți: 2, Miercuri: 3, Joi: 3, Vineri: 2)
const expectedDayCounts = {
  Luni: 3,
  Marți: 2,
  Miercuri: 3,
  Joi: 3,
  Vineri: 2,
};
for (const day of DAYS_ORDER) {
  const count = INITIAL_SCHEDULE.filter((it) => it.day === day).length;
  assert.equal(
    count,
    expectedDayCounts[day],
    `Expected ${expectedDayCounts[day]} activities on ${day}, found ${count}`
  );
}

// 2. Verify attendance + button (incrementAttendance), - button (decrementAttendance), and custom target per professor
let state = createInitialState({});
const targetCourseId = "luni-engleza-sem"; // Limba engleză 1 (SEMINAR)

// Modify requiredTarget for Limba engleză 1 to 5 attendances without affecting other activities
state = setRequiredTarget(state, targetCourseId, 5);
assert.equal(
  state[targetCourseId].requiredTarget,
  5,
  "setRequiredTarget must update the professor's required target for Limba engleză 1 to 5"
);
assert.equal(
  state["luni-drept-curs"].requiredTarget,
  7,
  "Other courses must retain their own independent requiredTarget"
);

// Press + 4 times -> not yet met (4 < 5)
for (let i = 0; i < 4; i += 1) {
  state = incrementAttendance(state, targetCourseId);
}
assert.equal(state[targetCourseId].attendedCount, 4);
assert.equal(
  isTargetMet(
    state[targetCourseId].attendedCount,
    state[targetCourseId].requiredTarget
  ),
  false,
  "Green checkmark must NOT appear before reaching the minimum target (4/5)"
);

// Press + 1 more time -> 5/5 -> Green Checkmark (Bifă verde) activates!
state = incrementAttendance(state, targetCourseId);
assert.equal(state[targetCourseId].attendedCount, 5);
assert.equal(
  isTargetMet(
    state[targetCourseId].attendedCount,
    state[targetCourseId].requiredTarget
  ),
  true,
  "Green checkmark MUST activate immediately when attendedCount >= requiredTarget (5/5)"
);

// Verify rendered HTML card includes the green checkmark badge class and text
const renderedCardHtml = renderActivityCard(
  INITIAL_SCHEDULE[0],
  state[targetCourseId]
);
assert.ok(
  renderedCardHtml.includes("green-check-badge"),
  "Rendered card must display .green-check-badge when target is met"
);
assert.ok(
  renderedCardHtml.includes("card-completed"),
  "Rendered card must have .card-completed class when target is met"
);

// Verify decrement (-) drops back to 4/5 and removes green checkmark
state = decrementAttendance(state, targetCourseId);
assert.equal(state[targetCourseId].attendedCount, 4);
assert.equal(
  isTargetMet(
    state[targetCourseId].attendedCount,
    state[targetCourseId].requiredTarget
  ),
  false
);

// Verify toggleSessionSlot (clicking week checkbox S10 directly)
state = toggleSessionSlot(state, targetCourseId, 9);
assert.equal(state[targetCourseId].attendedCount, 5);
assert.equal(state[targetCourseId].checkedSlots[9], true);

// Verify dashboard stats calculation
const stats = computeDashboardStats(state);
assert.equal(stats.totalActivities, 13);
assert.equal(stats.completedActivities, 1);
assert.equal(stats.completedSeminars, 1);
assert.equal(stats.completedCourses, 0);

// Verify classic timetable table render
const tableHtml = renderScheduleTable(INITIAL_SCHEDULE, state);
assert.ok(tableHtml.includes("schedule-table"));
assert.ok(tableHtml.includes("row-completed"));

// 3. Verify static files exist and contain required hooks
const indexHtml = fs.readFileSync(path.join(__dirname, "index.html"), "utf8");
const stylesCss = fs.readFileSync(path.join(__dirname, "styles.css"), "utf8");
assert.ok(indexHtml.includes('id="schedule-root"'));
assert.ok(stylesCss.includes(".green-check-badge"));
assert.ok(stylesCss.includes("@container (width < 680px)"));

// 4. Generate file:// standalone bundle so double-clicking index.html in Windows Explorer works without a server
const rawDataJs = fs
  .readFileSync(path.join(__dirname, "schedule-data.js"), "utf8")
  .replace(/export const /g, "const ")
  .replace(/export function /g, "function ");
const rawAppJs = fs
  .readFileSync(path.join(__dirname, "app.js"), "utf8")
  .replace(/import \{[\s\S]*?\}\s*from\s*["']\.\/schedule-data\.js["'];\r?\n?/, "")
  .replace(/export function /g, "function ");

const standaloneBundle = `if (typeof window !== "undefined" && window.location.protocol === "file:") {\n(function() {\n${rawDataJs}\n${rawAppJs}\n})();\n}\n`;
fs.writeFileSync(path.join(__dirname, "bundle-standalone.js"), standaloneBundle, "utf8");

console.log("ALL VERIFICATION CHECKS PASSED (13/13 activities, + / - counter, custom targets, green checkmark badge)");
