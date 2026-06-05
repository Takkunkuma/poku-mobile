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

### 🔲 Planned — Must Have

#### Multi-step Task Creation (replaces current single-page form)
- [ ] **Page 1:** Title + Why (description is optional, de-emphasised)
- [ ] **Page 2:** Difficulty (1–5)
- [ ] **Page 3:** Pick friend(s) — can select multiple simultaneously
- [ ] **Page 4:** Schedule — shows selected friends in large text at top, then:
  - Pick date/time for first reminder
  - Pick number of reminders (e.g. 1–5)
  - Pick interval between reminders (e.g. every 5 min, 15 min, 1 hr)
  - Pick notification type: **Standard** or **Time Sensitive** (see Notifications below)

#### Multiple Friends Per Task
- [ ] Send the same task reminder request to multiple friends simultaneously
- [ ] All accepted friends can each send reminders independently
- [ ] When task is marked done, all remaining open requests are auto-cancelled
- [ ] Everyone receives points based on their individual performance

#### Rejection Reason
- [ ] When a friend rejects a reminder request, they can optionally write a short reason why
- [ ] Requester sees the reason in their notification

#### Profile Screen
- [ ] Profile icon in top-left of Dashboard header
- [ ] Tapping navigates to a full Profile screen showing:
  - Username
  - Total points
  - Option to change username
- [ ] Username change rules:
  - Must be unique (no duplicate usernames)
  - Maximum 2 changes per account lifetime
  - Show remaining changes allowed
- [ ] Sign out button

#### Points Display
- [ ] Username + points shown on Profile screen
- [ ] Points shown next to username on Dashboard

#### Background Push Notifications
- [ ] Supabase Edge Function triggers Expo Push API on every `notifications` table INSERT
- [ ] Store `expo_push_token` on `users` table
- [ ] Push token registered and saved on app launch
- [ ] Works when app is closed or phone is locked

#### Notification Types (set by task creator on page 4)
- [ ] **Standard:** Regular background push notification
- [ ] **Time Sensitive:** Breaks through Focus modes, appears prominently on lock screen (iOS time-sensitive interruption level)

#### Revised Point System

**Task owner (person who needs to complete the task):**
- Points = 1 × (reminders_left + 1) at time of completion
  - Finished on 1st of 3 reminders → 2 left + 1 = 3 points
  - Finished on 2nd of 3 reminders → 1 left + 1 = 2 points
  - Finished on 3rd of 3 reminders → 0 left + 1 = 1 point
- Penalty if not completed after all reminders sent → -1 × total reminders committed (e.g. -3 for 3 reminders)

**Reminder sender (friend):**
- 1 point per on-time reminder sent (within ±30 min of scheduled time)
- 0 points for late or missed reminders
- Example: A sends 2 on-time reminders → 2 points. B sends 1 on-time reminder → 1 point.
- Senders also share the penalty if the task owner fails to complete: -1 per reminder they sent

#### Database Schema Changes Required
```sql
-- users table
ALTER TABLE users ADD COLUMN username_changes int DEFAULT 0;
ALTER TABLE users ADD COLUMN expo_push_token text;

-- reminder_requests table
ALTER TABLE reminder_requests ADD COLUMN repeat_count int DEFAULT 1;
ALTER TABLE reminder_requests ADD COLUMN interval_minutes int;
ALTER TABLE reminder_requests ADD COLUMN reminders_sent int DEFAULT 0;
ALTER TABLE reminder_requests ADD COLUMN notification_type text DEFAULT 'standard';
ALTER TABLE reminder_requests ADD COLUMN rejection_reason text;
```

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
| 1.0.2   | TBD        | Next release |
