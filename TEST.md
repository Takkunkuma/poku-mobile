# PokU Reminder — Test Checklist

Run through this before every TestFlight release. Mark each item ✅ Pass / ❌ Fail / ⚠️ Partial.

---

## Auth
| # | Test | Expected | Status |
|---|------|----------|--------|
| A1 | Open app cold (not logged in) | Landing screen with Google button | |
| A2 | Tap "Continue with Google" | Browser opens, Google sign-in flow works | |
| A3 | Complete Google sign-in (new user) | Redirected to username setup screen | |
| A4 | Complete Google sign-in (existing user) | Redirected to dashboard | |
| A5 | Set username (new user) | Dashboard loads, username shown | |
| A6 | Try duplicate username in setup | Error: "Username already taken" | |
| A7 | Dev login button visible in dev mode | Small 🛠 button under Google button | |
| A8 | Dev login button NOT visible in TestFlight | Button absent in production build | |
| A9 | Sign out from Profile screen | Returns to landing screen | |
| A10 | Re-open app after signing out | Landing screen (session cleared) | |

---

## Task Creation Wizard
| # | Test | Expected | Status |
|---|------|----------|--------|
| T1 | Tap + button on dashboard | Step 1 of wizard opens | |
| T2 | Step 1: submit empty title | Next button disabled | |
| T3 | Step 1: fill title + why, tap Next | Advances to Step 2 | |
| T4 | Step 2: select difficulty, tap Next | Advances to Step 3 | |
| T5 | Step 3: no friends yet | Message shown, Next disabled | |
| T6 | Step 3: select 1 friend | Friend highlighted, Next enabled | |
| T7 | Step 3: select multiple friends | All highlighted, Next enabled | |
| T8 | Step 4: shows selected friends in chips | Friend names visible at top | |
| T9 | Step 4: set date/time | Date picker works | |
| T10 | Step 4: set repeat count (e.g. 3) | Interval options appear | |
| T11 | Step 4: set interval | Interval selected | |
| T12 | Step 4: toggle notification type | Standard / Time Sensitive switch works | |
| T13 | Tap Create Task | Task appears on dashboard, requests sent to friends | |
| T14 | Tap back arrow on any step | Goes to previous step, data preserved | |

---

## Dashboard
| # | Test | Expected | Status |
|---|------|----------|--------|
| D1 | Dashboard loads | Task list appears | |
| D2 | Username shown below "My Tasks" | @username visible | |
| D3 | Pull to refresh | Tasks reload | |
| D4 | Task with status `open` | Yellow "open" badge | |
| D5 | Task with status `reminded` | Blue "reminded" badge, orange reminder banner | |
| D6 | Task with status `done` | Green "done" badge | |
| D7 | Friend sends reminder (app in foreground) | Dashboard updates to `reminded` in real-time | |
| D8 | Tap reminder banner ✕ | Banner dismisses, notification marked read | |
| D9 | Profile icon top-left | Navigates to Profile screen | |
| D10 | Points update after completing task | Points increase shown | |

---

## Task Detail
| # | Test | Expected | Status |
|---|------|----------|--------|
| TD1 | Tap task card | Task detail opens | |
| TD2 | Task `open`, no requests | "Mark as complete" button + re-request form | |
| TD3 | Task `open`, active requests | Request list shows friend + status | |
| TD4 | Task `reminded` | Both "✅ Yes, completed" and "❌ Not yet" buttons | |
| TD5 | Tap "Yes, completed" | Status → done, points awarded, both users notified | |
| TD6 | Tap "Not yet" (reminders remaining) | Status → open, re-request form appears | |
| TD7 | Tap "Not yet" (all reminders exhausted) | Penalty applied, alert shown, friends notified | |
| TD8 | Task `done` | Completion card shown, no action buttons | |

---

## Inbox
| # | Test | Expected | Status |
|---|------|----------|--------|
| I1 | Friend sends reminder request | Appears in Inbox (real-time, no re-open needed) | |
| I2 | Accept a request | Status → accepted, requester notified | |
| I3 | Reject a request (no reason) | Status → rejected, requester notified | |
| I4 | Reject a request (with reason) | Reason sent in notification payload | |
| I5 | Accepted request: tap "Send 1st reminder" | Task status → reminded, requester notified | |
| I6 | Send 2nd, 3rd reminder | Button text updates correctly (ordinal) | |
| I7 | After all reminders sent | Shows "All X reminders sent" | |
| I8 | Completed section | Shows completed tasks with points earned | |

---

## Friends
| # | Test | Expected | Status |
|---|------|----------|--------|
| F1 | Search non-existent username | "No user found" message | |
| F2 | Search existing username | User shown with "Send Request" button | |
| F3 | Send friend request | Appears in "Pending Sent" | |
| F4 | Receive friend request | Appears in "Friend Requests" section | |
| F5 | Accept friend request | Moves to "Friends" list (real-time) | |
| F6 | Friends list shows correctly | All accepted friends visible | |

---

## Profile
| # | Test | Expected | Status |
|---|------|----------|--------|
| P1 | Profile screen opens | Username, points, change option | |
| P2 | Points show correctly | Matches Supabase users table | |
| P3 | Change username (1st time) | Updated, "1 change remaining" shown | |
| P4 | Change to taken username | Error: "Username already taken" | |
| P5 | Change username (2nd time) | Updated, "0 changes remaining" | |
| P6 | Try to change username (3rd time) | Button disabled / "No changes remaining" | |
| P7 | Sign out | Returns to landing | |

---

## Points System
| # | Test | Expected | Status |
|---|------|----------|--------|
| PT1 | Complete task, 1 reminder committed, done on 1st | Owner: +1pt, Friend: +1pt | |
| PT2 | Complete task, 3 reminders, done on 1st | Owner: +3pts, Friend: +1pt | |
| PT3 | Complete task, 3 reminders, done on 2nd | Owner: +2pts, Friend: +2pts | |
| PT4 | Complete task, 3 reminders, done on 3rd | Owner: +1pt, Friend: +3pts | |
| PT5 | Not yet, all 3 reminders exhausted | Owner: -3pts, Friend: -3pts | |
| PT6 | Points visible in Supabase users table | Matches in-app display | |

---

## Notifications
| # | Test | Expected | Status |
|---|------|----------|--------|
| N1 | Friend sends request (receiver's app open) | Local notification fires | |
| N2 | Friend sends request (receiver's app closed) | Push notification on lock screen | |
| N3 | Reminder sent (receiver's app open) | Local notification fires | |
| N4 | Reminder sent (receiver's app closed) | Push notification on lock screen | |
| N5 | Task completed (friend's app open) | Local notification fires | |
| N6 | Task completed (friend's app closed) | Push notification on lock screen | |
| N7 | Notification type "Time Sensitive" | Breaks through Focus mode on iOS | |
| N8 | Push token saved in Supabase | users.expo_push_token not null after first open | |

---

## Known Issues / Backlog
- Critical alerts (full lock screen alarm) — requires Apple entitlement, deferred
- Android build not yet set up
- Background penalty timer (auto-penalty after all reminders exhausted without "Not yet" tap) — not implemented
- Leaderboard — not implemented
