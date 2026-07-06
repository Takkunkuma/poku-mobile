import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import {
  View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert,
} from 'react-native'
import { useFocusEffect } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { difficultyColor, difficultyTextColor, difficultyLabel } from '@/lib/difficulty'
import { formatDateTime } from '@/lib/datetime'
import DateTimeField from '@/components/DateTimeField'
import type { DashboardStackParamList } from '@/navigation/AppNavigator'

type Props = NativeStackScreenProps<DashboardStackParamList, 'TaskDetail'>

type Task = {
  id: string; title: string; description: string; why: string
  difficulty: number; status: string; owner_id: string
}
type ActiveRequest = {
  id: string; status: string; scheduled_at: string
  repeat_count: number; reminders_sent: number; interval_minutes: number | null
  assignee: { id: string; username: string } | null
}
type Friend = { id: string; username: string }

function formatInterval(minutes: number | null): string {
  if (!minutes) return '?'
  if (minutes < 60) return `${minutes}min`
  if (minutes < 1440) return `${minutes / 60}hr`
  return `${minutes / 1440}day`
}

const statusStyle: Record<string, { bg: string; text: string }> = {
  open:     { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  reminded: { bg: 'bg-blue-100',   text: 'text-blue-700'   },
  done:     { bg: 'bg-green-100',  text: 'text-green-700'  },
}

export default function TaskDetailScreen({ route, navigation }: Props) {
  const { taskId } = route.params
  const { user, username, refreshProfile } = useAuth()

  const [task, setTask] = useState<Task | null>(null)
  const [activeRequests, setActiveRequests] = useState<ActiveRequest[]>([])
  const [friends, setFriends] = useState<Friend[]>([])
  const [loading, setLoading] = useState(true)
  const [marking, setMarking] = useState(false)
  const [notYetLoading, setNotYetLoading] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Re-request form state
  const [showReRequest, setShowReRequest] = useState(false)
  const [selectedFriend, setSelectedFriend] = useState<Friend | null>(null)
  const [scheduledAt, setScheduledAt] = useState(new Date(Date.now() + 3600_000))
  const [sending, setSending] = useState(false)

  // Inline reminder editing
  const [editMode, setEditMode] = useState(false)
  const [editTime, setEditTime] = useState<Date | null>(null)
  const [addSelected, setAddSelected] = useState<Friend[]>([])
  const [savingEdit, setSavingEdit] = useState(false)

  async function fetchData() {
    if (!user) return
    const [taskRes, requestRes, friendRes] = await Promise.all([
      supabase.from('tasks').select('*').eq('id', taskId).single(),
      supabase
        .from('reminder_requests')
        .select('id, status, scheduled_at, repeat_count, reminders_sent, interval_minutes, assignee:users!reminder_requests_assignee_id_fkey(id, username)')
        .eq('task_id', taskId)
        .in('status', ['pending', 'accepted', 'sent'])
        .order('created_at', { ascending: true }),
      supabase
        .from('friendships')
        .select('requester:users!friendships_requester_id_fkey(id,username), addressee:users!friendships_addressee_id_fkey(id,username)')
        .eq('status', 'accepted')
        .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`),
    ])
    setTask(taskRes.data)
    setActiveRequests((requestRes.data ?? []) as unknown as ActiveRequest[])
    const raw = (friendRes.data ?? []) as unknown as Array<{ requester: Friend; addressee: Friend }>
    setFriends(raw.map(f => f.requester.id === user.id ? f.addressee : f.requester))
    setLoading(false)
  }

  useFocusEffect(useCallback(() => { fetchData() }, [taskId, user]))

  // Edit / Done toggle in the header, only while the task is still active.
  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () =>
        task && task.status !== 'done' ? (
          <TouchableOpacity onPress={() => { setEditMode(e => !e); setEditTime(null); setAddSelected([]) }} hitSlop={8}>
            <Text style={{ color: '#f97316', fontSize: 16, fontWeight: editMode ? '600' : '400' }}>
              {editMode ? 'Done' : 'Edit'}
            </Text>
          </TouchableOpacity>
        ) : null,
    })
  }, [navigation, task, editMode])

  // Cancel a single request you sent by mistake — notifies that person.
  async function cancelRequest(req: ActiveRequest) {
    if (!task || !req.assignee) return
    setSavingEdit(true)
    const { error } = await supabase.from('reminder_requests').update({ status: 'cancelled' }).eq('id', req.id)
    if (error) {
      setSavingEdit(false)
      Alert.alert('Couldn’t cancel', 'Please check your connection and try again.')
      return
    }
    await supabase.from('notifications').insert({
      recipient_id: req.assignee.id,
      type: 'request_cancelled',
      payload: { task_title: task.title, from_username: username },
    })
    setSavingEdit(false)
    fetchData()
  }

  // Change the reminder time for the whole task — everyone re-approves.
  async function applyTimeChange() {
    if (!task || !editTime) return
    setSavingEdit(true)
    const { error } = await supabase
      .from('reminder_requests')
      .update({ scheduled_at: editTime.toISOString(), status: 'pending', reminders_sent: 0, nudges_sent: 0 })
      .eq('task_id', task.id)
      .in('status', ['pending', 'accepted', 'sent'])
    if (error) {
      setSavingEdit(false)
      Alert.alert('Couldn’t update the time', 'Please check your connection and try again.')
      return
    }
    // Reminders were reset, so the task is open again until someone re-approves + reminds.
    await supabase.from('tasks').update({ status: 'open' }).eq('id', task.id)
    // Re-notify everyone to approve the new time.
    const { data: reqs } = await supabase
      .from('reminder_requests')
      .select('id, assignee_id')
      .eq('task_id', task.id)
      .eq('status', 'pending')
    await Promise.all((reqs ?? []).map(r =>
      supabase.from('notifications').insert({
        recipient_id: r.assignee_id,
        type: 'reminder_request',
        payload: { task_id: task.id, task_title: task.title, request_id: r.id, from_username: username },
      })
    ))
    setEditTime(null)
    setSavingEdit(false)
    fetchData()
  }

  // Add more friends to remind you, matching the task's existing schedule.
  async function addPeople() {
    if (!task || addSelected.length === 0) return
    setSavingEdit(true)
    const template = activeRequests[0]
    const sched = (editTime ?? (template ? new Date(template.scheduled_at) : new Date(Date.now() + 3600_000))).toISOString()
    const repeat = template?.repeat_count ?? 1
    const interval = template?.interval_minutes ?? 60
    const failed: string[] = []
    await Promise.all(addSelected.map(async (f) => {
      const { data: request, error } = await supabase
        .from('reminder_requests')
        .insert({
          task_id: task.id, requester_id: user!.id, assignee_id: f.id,
          scheduled_at: sched, repeat_count: repeat, interval_minutes: interval, notification_type: 'standard',
        })
        .select()
        .single()
      if (error || !request) { failed.push(f.username); return }
      await supabase.from('notifications').insert({
        recipient_id: f.id,
        type: 'reminder_request',
        payload: { task_id: task.id, task_title: task.title, request_id: request.id, from_username: username },
      })
    }))
    setAddSelected([])
    setSavingEdit(false)
    fetchData()
    if (failed.length) Alert.alert('Some weren’t added', `Couldn’t reach ${failed.map(n => '@' + n).join(', ')}. Try again.`)
  }

  function confirmDelete() {
    Alert.alert(
      'Delete task?',
      'This permanently removes the task and any reminder requests for it. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: deleteTask },
      ],
    )
  }

  async function deleteTask() {
    if (!task) return
    setDeleting(true)
    // No FK cascade is guaranteed, so clear the reminder requests first.
    await supabase.from('reminder_requests').delete().eq('task_id', task.id)
    // .select() so we can tell a real delete from an RLS-filtered no-op (which
    // returns success with zero rows and no error).
    const { data: deleted, error } = await supabase.from('tasks').delete().eq('id', task.id).select('id')
    setDeleting(false)
    if (error || !deleted || deleted.length === 0) {
      Alert.alert('Couldn’t delete', 'Something went wrong. Please check your connection and try again.')
      return
    }
    navigation.goBack()
  }

  async function addPoints(userId: string, amount: number): Promise<boolean> {
    const { error } = await supabase.rpc('increment_points', { user_id: userId, amount })
    if (error) console.log('[points] failed to add points', userId, amount, error.message)
    return !error
  }

  async function markDone() {
    if (!task) return
    setMarking(true)

    // Fetch fresh from DB — component state may be stale if reminder was sent after last render
    const { data: freshRequests } = await supabase
      .from('reminder_requests')
      .select('id, status, repeat_count, reminders_sent, assignee:users!reminder_requests_assignee_id_fkey(id, username)')
      .eq('task_id', task.id)
      .not('status', 'in', '("rejected","cancelled")')

    const allRequests = (freshRequests ?? []) as unknown as ActiveRequest[]
    const totalCommitted = allRequests.reduce((sum, r) => sum + (r.repeat_count ?? 1), 0)
    const totalSent = allRequests.reduce((sum, r) => sum + (r.reminders_sent ?? 0), 0)
    const ownerPoints = Math.max(1, totalCommitted - totalSent + 1)

    // Core write: mark the task done. If this fails, nothing else should run —
    // otherwise we'd hand out points for a task that isn't actually complete.
    const { error: doneError } = await supabase.from('tasks').update({ status: 'done' }).eq('id', task.id)
    if (doneError) {
      setMarking(false)
      Alert.alert('Couldn’t complete task', 'Something went wrong. Please check your connection and try again.')
      return
    }

    await supabase
      .from('reminder_requests')
      .update({ status: 'cancelled' })
      .eq('task_id', task.id)
      .in('status', ['pending', 'accepted'])

    // Award points. Track any failures so we can tell the user a payout didn't land.
    let pointsFailed = false
    if (!(await addPoints(user!.id, ownerPoints))) pointsFailed = true

    await Promise.all(allRequests.map(async (req) => {
      if (!req.assignee) return
      const friendPoints = req.reminders_sent ?? 0
      if (friendPoints > 0) {
        if (!(await addPoints(req.assignee.id, friendPoints))) pointsFailed = true
      }
      await supabase.from('notifications').insert({
        recipient_id: req.assignee.id,
        type: 'task_done',
        payload: { task_title: task.title, owner_username: username, points_earned: String(friendPoints) },
      })
    }))

    await refreshProfile()
    setMarking(false)
    fetchData()

    if (pointsFailed) {
      Alert.alert('Task completed', 'But some points didn’t save correctly. Pull to refresh in a moment to check your total.')
    }
  }

  async function markNotYet() {
    if (!task) return
    setNotYetLoading(true)

    // Fetch fresh data to get accurate reminders_sent counts
    const { data: freshRequests } = await supabase
      .from('reminder_requests')
      .select('id, status, repeat_count, reminders_sent, assignee:users!reminder_requests_assignee_id_fkey(id, username)')
      .eq('task_id', task.id)
      .not('status', 'in', '("rejected","cancelled")')

    const allRequests = (freshRequests ?? []) as unknown as ActiveRequest[]
    const totalSent = allRequests.reduce((sum, r) => sum + (r.reminders_sent ?? 0), 0)
    const allExhausted = allRequests.length > 0 &&
      allRequests.every(r => (r.reminders_sent ?? 0) >= (r.repeat_count ?? 1))

    const { error: openError } = await supabase.from('tasks').update({ status: 'open' }).eq('id', task.id)
    if (openError) {
      setNotYetLoading(false)
      Alert.alert('Something went wrong', 'Please check your connection and try again.')
      return
    }

    if (allExhausted && totalSent > 0) {
      // All reminders used up and still not done — apply penalties
      await addPoints(user!.id, -totalSent)

      await Promise.all(allRequests.map(async (req) => {
        if (!req.assignee || !req.reminders_sent) return
        await addPoints(req.assignee.id, -req.reminders_sent)
        await supabase.from('notifications').insert({
          recipient_id: req.assignee.id,
          type: 'task_failed',
          payload: {
            task_title: task.title,
            owner_username: username,
            penalty: String(req.reminders_sent),
          },
        })
      }))

      await refreshProfile()
      Alert.alert(
        'Penalty applied',
        `You used all ${totalSent} reminder${totalSent > 1 ? 's' : ''} without completing the task. -${totalSent} point${totalSent > 1 ? 's' : ''}.`
      )
    } else {
      // Reminders still remaining — just reset, let them request more
      setShowReRequest(true)
    }

    setNotYetLoading(false)
    fetchData()
  }

  async function sendReRequest() {
    if (!selectedFriend || !task) return
    setSending(true)
    const { data: request, error: reqError } = await supabase
      .from('reminder_requests')
      .insert({
        task_id: task.id,
        requester_id: user!.id,
        assignee_id: selectedFriend.id,
        scheduled_at: scheduledAt.toISOString(),
        repeat_count: 1,
        interval_minutes: 60,
        notification_type: 'standard',
      })
      .select()
      .single()

    if (reqError || !request) {
      setSending(false)
      Alert.alert('Couldn’t send request', `We couldn’t reach @${selectedFriend.username}. Please try again.`)
      return
    }

    await supabase.from('notifications').insert({
      recipient_id: selectedFriend.id,
      type: 'reminder_request',
      payload: { task_id: task.id, task_title: task.title, request_id: request.id, from_username: username },
    })
    setSending(false)
    setShowReRequest(false)
    setSelectedFriend(null)
    fetchData()
  }

  if (loading || !task) {
    return <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#f97316" /></View>
  }

  const s = statusStyle[task.status] ?? statusStyle.open
  const isReminded = task.status === 'reminded'
  const remindedRequest = activeRequests.find(r => r.status === 'sent' && (r.reminders_sent ?? 0) > 0)
  const pendingOrAccepted = activeRequests.filter(r => ['pending', 'accepted'].includes(r.status))

  const activeAssigneeIds = new Set(activeRequests.map(r => r.assignee?.id).filter(Boolean))
  const availableToAdd = friends.filter(f => !activeAssigneeIds.has(f.id))
  const editTimeValue = editTime ?? (activeRequests[0] ? new Date(activeRequests[0].scheduled_at) : new Date(Date.now() + 3600_000))

  return (
    <ScrollView className="flex-1 bg-gray-50" contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: 40 }}>
      {/* Task card */}
      <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
        <View className="flex-row items-start justify-between mb-3">
          <Text className="text-xl font-bold text-gray-900 flex-1 pr-2">{task.title}</Text>
          <View className={`rounded-full px-2 py-1 ${s.bg}`}>
            <Text className={`text-xs font-medium ${s.text}`}>{task.status}</Text>
          </View>
        </View>
        {task.description ? <Text className="text-gray-600 text-sm mb-2">{task.description}</Text> : null}
        {task.why ? (
          <View className="bg-orange-50 rounded-2xl px-4 py-3 mb-2">
            <Text className="text-orange-700 text-sm">💡 <Text className="font-bold">Why:</Text> {task.why}</Text>
          </View>
        ) : null}
        <View
          className="self-start rounded-full px-3 py-1"
          style={{ backgroundColor: difficultyColor(task.difficulty, 0.15) }}
        >
          <Text className="text-xs font-medium" style={{ color: difficultyTextColor(task.difficulty) }}>
            {difficultyLabel(task.difficulty)}
          </Text>
        </View>
      </View>

      {/* Inline reminder editing (toggled via the header Edit button) */}
      {editMode && task.status !== 'done' && (
        <View className="bg-white rounded-2xl shadow-sm border border-orange-200 p-5 gap-4">
          <Text className="font-bold text-gray-900">Edit reminders</Text>

          {/* Change time for everyone */}
          <View className="gap-2">
            <Text className="text-sm font-semibold text-gray-700">Reminder time</Text>
            <DateTimeField value={editTimeValue} onChange={setEditTime} minimumDate={new Date()} />
            {editTime && (
              <>
                <Text className="text-orange-600 text-xs">Changing the time asks everyone to approve again.</Text>
                <TouchableOpacity
                  onPress={applyTimeChange}
                  disabled={savingEdit}
                  className="bg-orange-500 rounded-2xl py-3 items-center disabled:opacity-50"
                  activeOpacity={0.8}
                >
                  {savingEdit ? <ActivityIndicator color="#fff" /> : (
                    <Text className="text-white font-semibold text-sm">Apply new time</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>

          {/* Cancel existing requests */}
          {activeRequests.length > 0 && (
            <View className="gap-2 border-t border-gray-100 pt-3">
              <Text className="text-sm font-semibold text-gray-700">People reminding you</Text>
              {activeRequests.map(req => (
                <View key={req.id} className="flex-row items-center justify-between">
                  <Text className="text-gray-800">@{req.assignee?.username ?? '...'}</Text>
                  <TouchableOpacity onPress={() => cancelRequest(req)} disabled={savingEdit} className="px-3 py-1.5">
                    <Text className="text-red-500 text-sm font-medium">Cancel</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {/* Add more people */}
          {availableToAdd.length > 0 && (
            <View className="gap-2 border-t border-gray-100 pt-3">
              <Text className="text-sm font-semibold text-gray-700">Add more people</Text>
              <View className="flex-row flex-wrap gap-2">
                {availableToAdd.map(f => {
                  const sel = addSelected.some(x => x.id === f.id)
                  return (
                    <TouchableOpacity
                      key={f.id}
                      onPress={() => setAddSelected(prev => sel ? prev.filter(x => x.id !== f.id) : [...prev, f])}
                      className="rounded-full px-3 py-1.5 border"
                      style={{ backgroundColor: sel ? '#f97316' : '#ffffff', borderColor: sel ? '#f97316' : '#e5e7eb' }}
                      activeOpacity={0.7}
                    >
                      <Text className="text-sm font-medium" style={{ color: sel ? '#ffffff' : '#374151' }}>@{f.username}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>
              {addSelected.length > 0 && (
                <TouchableOpacity
                  onPress={addPeople}
                  disabled={savingEdit}
                  className="bg-orange-500 rounded-2xl py-3 items-center disabled:opacity-50"
                  activeOpacity={0.8}
                >
                  {savingEdit ? <ActivityIndicator color="#fff" /> : (
                    <Text className="text-white font-semibold text-sm">
                      Add {addSelected.length} {addSelected.length === 1 ? 'person' : 'people'}
                    </Text>
                  )}
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}

      {/* Done */}
      {task.status === 'done' && (
        <View className="bg-green-50 border border-green-200 rounded-2xl p-6 items-center">
          <Text className="text-3xl mb-2">🎉</Text>
          <Text className="font-semibold text-green-700 text-center">Task complete! Points awarded.</Text>
        </View>
      )}

      {/* Reminded — two options */}
      {isReminded && (
        <View className="bg-orange-50 border-2 border-orange-400 rounded-2xl p-5 gap-3">
          <View>
            <Text className="text-orange-700 font-semibold text-sm mb-1">
              🔔 {remindedRequest?.assignee?.username ? `@${remindedRequest.assignee.username}` : 'Your friend'} reminded you!
            </Text>
            <Text className="text-orange-600 text-xs">Did you get this done?</Text>
          </View>
          <TouchableOpacity
            onPress={markDone}
            disabled={marking}
            className="bg-green-500 rounded-2xl py-4 items-center disabled:opacity-50"
            activeOpacity={0.8}
          >
            {marking ? <ActivityIndicator color="#fff" /> : (
              <Text className="text-white font-bold text-base">✅ Yes, I completed this!</Text>
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={markNotYet}
            disabled={notYetLoading}
            className="bg-white border border-orange-200 rounded-2xl py-4 items-center disabled:opacity-50"
            activeOpacity={0.7}
          >
            {notYetLoading ? <ActivityIndicator color="#f97316" /> : (
              <Text className="text-orange-500 font-semibold text-base">❌ Not yet done</Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Active requests list */}
      {pendingOrAccepted.length > 0 && (
        <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5">
          <Text className="font-semibold text-gray-900 mb-3">Reminder requests</Text>
          {pendingOrAccepted.map(req => (
            <View key={req.id} className="flex-row items-center justify-between py-2 border-b border-gray-50">
              <View>
                <Text className="text-gray-800 font-medium">@{req.assignee?.username ?? '...'}</Text>
                <Text className="text-gray-400 text-xs">
                  {req.repeat_count}× · every {formatInterval(req.interval_minutes)} · {formatDateTime(req.scheduled_at)}
                </Text>
              </View>
              <View className={`rounded-full px-2 py-0.5 ${req.status === 'accepted' ? 'bg-blue-100' : 'bg-yellow-100'}`}>
                <Text className={`text-xs font-medium ${req.status === 'accepted' ? 'text-blue-700' : 'text-yellow-700'}`}>
                  {req.status}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Re-request form — shown after "Not yet" or when open with no requests */}
      {(showReRequest || (task.status === 'open' && pendingOrAccepted.length === 0)) && task.status !== 'done' && (
        <View className="bg-white rounded-2xl shadow-sm border border-gray-100 p-5 gap-4">
          <Text className="font-semibold text-gray-900">
            {showReRequest ? 'Ask someone to remind you again' : 'Ask a friend to remind you'}
          </Text>
          {!friends.length ? (
            <Text className="text-gray-400 text-sm">No friends yet — add some in the Friends tab.</Text>
          ) : (
            <>
              <View className="gap-2">
                {friends.map(f => {
                  const selected = selectedFriend?.id === f.id
                  return (
                    <TouchableOpacity
                      key={f.id}
                      onPress={() => setSelectedFriend(f)}
                      className={`flex-row items-center justify-between px-4 py-3 rounded-2xl border ${selected ? 'border-orange-400 bg-orange-50' : 'border-gray-200'}`}
                      activeOpacity={0.7}
                    >
                      <Text className={`font-medium ${selected ? 'text-orange-700' : 'text-gray-700'}`}>@{f.username}</Text>
                      {selected && <Text className="text-orange-500">✓</Text>}
                    </TouchableOpacity>
                  )
                })}
              </View>
              <DateTimeField value={scheduledAt} onChange={setScheduledAt} minimumDate={new Date()} />
              <TouchableOpacity
                onPress={sendReRequest}
                disabled={sending || !selectedFriend}
                className="bg-orange-500 rounded-2xl py-4 items-center disabled:opacity-50"
                activeOpacity={0.8}
              >
                {sending ? <ActivityIndicator color="#fff" /> : (
                  <Text className="text-white font-semibold">📨 Send Reminder Request</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      )}

      {/* Manual complete (open, no reminders) */}
      {task.status === 'open' && (
        <TouchableOpacity
          onPress={markDone}
          disabled={marking}
          className="border border-gray-200 bg-white rounded-2xl py-4 items-center disabled:opacity-50"
          activeOpacity={0.7}
        >
          {marking ? <ActivityIndicator color="#6b7280" /> : (
            <Text className="text-gray-500 text-sm font-medium">Mark as complete</Text>
          )}
        </TouchableOpacity>
      )}

      {/* Delete task */}
      <TouchableOpacity
        onPress={confirmDelete}
        disabled={deleting}
        className="py-4 items-center mt-2 disabled:opacity-50"
        activeOpacity={0.7}
      >
        {deleting ? <ActivityIndicator color="#ef4444" /> : (
          <Text className="text-red-500 text-sm font-medium">🗑 Delete task</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  )
}
