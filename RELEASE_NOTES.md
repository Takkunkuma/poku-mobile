# Release notes

Running log of TestFlight releases. Newest on top. The "What to test" block is
the emoji-free text pasted into TestFlight's Test Details field (that field
rejects emojis).

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
