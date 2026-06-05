# PRD: PokU Reminder — Mobile App

## What It Is
A social accountability app where users create tasks and delegate reminders to friends.
Core loop: create task → pick friends + schedule → friends send reminders → mark done → everyone earns points.

## Tech Stack
- **Framework:** Expo SDK 56 (React Native), cross-platform iOS + Android
- **Backend:** Supabase (shared with poku-web) — Postgres + Auth + Realtime
- **Auth:** Google OAuth via expo-auth-session
- **Notifications:** Expo Push Notifications (time-sensitive) + Supabase Edge Function trigger
- **Styling:** NativeWind v4 (Tailwind for React Native)
- **Navigation:** React Navigation (native-stack + bottom-tabs)
- **Distribution:** TestFlight (iOS), Google Play (Android — pending)

---

## Features

### ✅ Implemented

#### Auth
- [x] Google OAuth sign-in via Supabase + expo-auth-session (confirmed working on real devices)
- [x] Dev bypass login (🛠 Dev Login button, only visible in `__DEV__` mode)
- [x] Username setup screen on first login
- [x] Session persistence via expo-secure-store

#### Tasks
- [x] Create task (title, description, why, difficulty 1–5)
- [x] View task list on dashboard
- [x] Task detail screen
- [x] Mark task as complete from task detail (always available)
- [x] Mark task as complete when reminded by a friend
- [x] Task status flow: `open` → `reminded` → `done`
- [x] Reminder banner on dashboard when a friend sends a reminder

#### Friends
- [x] Search users by username
- [x] Send / accept / reject friend requests
- [x] Friends list

#### Reminders
- [x] Send reminder request to a single friend with scheduled date/time
- [x] Friend inbox: pending / accepted / past requests
- [x] Accept or reject reminder requests
- [x] Send reminder button
- [x] Points awarded on task completion (+1 each, flat)

#### Notifications
- [x] Supabase Realtime subscription for in-app notifications (foreground only)
- [x] Local notifications triggered by realtime events
- [x] Expo Push Notification setup (APNs key configured)
- [x] Notification types: reminder_request, request_accepted, request_rejected, reminder_sent, task_done

#### UI / Navigation
- [x] Bottom tab bar with Ionicons (Tasks / Inbox / Friends)
- [x] Native iOS large title header on Dashboard
- [x] Username shown below large title on dashboard
- [x] Native back navigation on stack screens
- [x] Pull-to-refresh on all list screens

---

### ✅ Implemented (continued)

#### Multi-step Task Creation
- [x] **Page 1:** Title + Why (description de-emphasised)
- [x] **Page 2:** Difficulty (1–5)
- [x] **Page 3:** Pick friend(s) — multiple simultaneous selection
- [x] **Page 4:** Schedule — selected friends shown at top, date/time, repeat count (1–5), interval, notification type

#### Multiple Friends Per Task
- [x] Send to multiple friends simultaneously
- [x] All accepted friends can send reminders independently
- [x] When task marked done, all open requests auto-cancelled
- [x] Everyone receives points based on individual performance

#### Rejection Reason
- [x] Friend can write optional reason when rejecting
- [x] Requester sees reason in their notification

#### Profile Screen
- [x] Profile icon (top-left of Dashboard) → full Profile screen
- [x] Shows username + total points
- [x] Change username (max 2 changes, shows remaining)
- [x] Sign out button

#### Background Push Notifications
- [x] Supabase Edge Function (`send-push-notification`) deployed
- [x] Database webhook triggers Edge Function on every notification INSERT
- [x] `expo_push_token` saved to users table on app launch
- [x] Works when app is closed or phone is locked

#### Notification Types
- [x] Standard and Time Sensitive options set by task creator on page 4
- [x] Time Sensitive breaks through Focus modes on iOS

#### Revised Point System
- [x] Owner: 1 × (reminders_left + 1) points on completion
- [x] Friends: points = reminders_sent count
- [x] Ordinal button text in inbox (Send 1st / 2nd / 3rd reminder)

---

### 🔲 Nice to Have

#### Multi-page Task Creation UX
- [ ] Each page has a progress indicator (e.g. step 1 of 4)
- [ ] Back navigation between pages without losing data

#### Alarm-style Notifications (Backlog)
- [ ] Critical Alerts entitlement (requires Apple approval — medical/safety apps)
- [ ] Full lock-screen inhibiting alarm UI
- [ ] Requires Apple entitlement review before shipping

#### Leaderboard
- [ ] Points leaderboard among friends

#### Photo Proof
- [ ] Task owner can attach a photo as proof of completion

#### Doubling / Escalation
- [ ] Mechanic where stakes increase with each missed reminder

---

## Releases

| Version | Date       | Notes |
|---------|------------|-------|
| 1.0.0   | 2026-06-03 | First TestFlight build — core flow working |
| 1.0.1   | 2026-06-03 | Native UI polish, Ionicons tab bar, mark-complete fix |
| 1.0.2   | TBD        | Profile screen, multi-step wizard, multiple friends, new points, background push |
