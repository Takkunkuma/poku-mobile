# Release notes

Running log of TestFlight releases. Newest on top. The "What to test" block is
the emoji-free text pasted into TestFlight's Test Details field (that field
rejects emojis).

---

## 1.0.6

What's new
- The date and time picker now stays open while you scroll. Keep spinning until you land on the right time, then tap Done to confirm.
- Tapping a notification now takes you to the right place: a "time to remind" notification opens Home, a poke or task update opens that task, a new request opens the Inbox, and friend activity opens Friends. This works even if the app was fully closed.
- Every reminder time now shows its timezone (for example "Jun 24, 7:00 PM PDT"). If you and your friend are in different timezones, each of you sees the reminder in your own local time.
- The Tasks tab is now Home. It shows both sides of the app in one place: reminders you owe to friends (with the live countdown and send button, moved here from the Inbox) on top, and your own tasks below.
- The Inbox is simpler now: the Requests tab only shows incoming requests waiting for your answer.

What to test
1. Create a task and open the time picker. Scroll the wheel several times and confirm it stays open until you tap Done.
2. Have a friend send you a reminder request, accept it, and confirm it appears on your Home screen with a countdown.
3. Send the reminder from Home when the countdown ends.
4. Tap each kind of notification you receive and confirm it opens the screen you expect, including when the app is closed.
5. If you know someone in another timezone, compare a reminder time and confirm each of you sees your own local time with the timezone label.

Found a bug or something confusing? Reply here or text me — screenshots help.

---

## 1.0.5

What's new
- You can now delete a task you created.
- You can edit a reminder request after sending it: add more people, change the time, or cancel a request you sent by mistake. Changing the time asks everyone to approve again.
- When you cancel a request, the person you canceled is notified.
- You now get a notification when someone sends you a friend request, and when a friend accepts yours.
- The Tasks header now shows the archive and add buttons as two separate circles to match the profile button.

What to test
1. Create a task, open it, and delete it. Confirm it disappears from your home list.
2. Open a task you created and tap Edit. Try adding a friend, changing the time, and canceling one request. Confirm the changes save.
3. After changing a task's time, confirm the people on it are asked to approve the new time again.
4. Cancel a request and confirm the canceled person gets a notification.
5. Send a friend request and confirm the other person gets a notification, then accept it and confirm you get one back.

Found a bug or something confusing? Reply here or text me — screenshots help.

---

## 1.0.4 (build 10)

What's new
- Tasks now show difficulty as a color (green = easy, red = hard) and a counter showing how many pokes (reminders) you've gotten.
- Background notifications now work — you'll get reminders on your lock screen even with the app closed.
- When a friend asks you to remind them, you get a nudge at the exact time, plus a live countdown on the "send reminder" button.
- Your inbox is now split into Requests, Past, and Completed tabs.

What to test
1. Tap "Allow" on the notification prompt when you first open the app — this is required for reminders to work.
2. Create a task, set a difficulty, and ask a friend to remind you.
3. Lock your phone and confirm the reminder shows up on your lock screen.
4. When you're asked to remind someone, watch the countdown and send the reminder when it turns blue.
5. Complete a task, then check your points and see who reminded you in the inbox.

Found a bug or something confusing? Reply here or text me — screenshots help.
