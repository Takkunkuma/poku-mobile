import React, { useEffect, useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  ActivityIndicator, KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { difficultyColor, difficultyTextColor, DIFFICULTY_LABELS } from '@/lib/difficulty'
import type { DashboardStackParamList } from '@/navigation/AppNavigator'

type Nav = NativeStackNavigationProp<DashboardStackParamList>
type Friend = { id: string; username: string }

const DIFFICULTIES = DIFFICULTY_LABELS.map((desc, i) => ({ value: i + 1, desc }))

const INTERVALS = [
  { label: '5 min', value: 5 },
  { label: '15 min', value: 15 },
  { label: '30 min', value: 30 },
  { label: '1 hr', value: 60 },
  { label: '2 hr', value: 120 },
  { label: '1 day', value: 1440 },
]

export default function NewTaskScreen() {
  const { user, username } = useAuth()
  const navigation = useNavigation<Nav>()

  const [step, setStep] = useState(1)
  const [loading, setLoading] = useState(false)
  const [friends, setFriends] = useState<Friend[]>([])

  // Form state
  const [title, setTitle] = useState('')
  const [why, setWhy] = useState('')
  const [difficulty, setDifficulty] = useState(3)
  const [selectedFriends, setSelectedFriends] = useState<Friend[]>([])
  const [scheduledAt, setScheduledAt] = useState(new Date(Date.now() + 3600_000))
  const [showPicker, setShowPicker] = useState(false)
  const [repeatCount, setRepeatCount] = useState(1)
  const [intervalMinutes, setIntervalMinutes] = useState(60)
  const [notificationType, setNotificationType] = useState<'standard' | 'time_sensitive'>('standard')

  useEffect(() => {
    if (!user) return
    supabase
      .from('friendships')
      .select('requester:users!friendships_requester_id_fkey(id,username), addressee:users!friendships_addressee_id_fkey(id,username)')
      .eq('status', 'accepted')
      .or(`requester_id.eq.${user.id},addressee_id.eq.${user.id}`)
      .then(({ data }) => {
        const raw = (data ?? []) as unknown as Array<{
          requester: Friend; addressee: Friend
        }>
        setFriends(raw.map(f => f.requester.id === user.id ? f.addressee : f.requester))
      })
  }, [user])

  function toggleFriend(friend: Friend) {
    setSelectedFriends(prev =>
      prev.find(f => f.id === friend.id)
        ? prev.filter(f => f.id !== friend.id)
        : [...prev, friend]
    )
  }

  async function handleSubmit() {
    if (!title.trim() || selectedFriends.length === 0) return
    setLoading(true)

    // Create task
    const { data: task, error } = await supabase
      .from('tasks')
      .insert({ title: title.trim(), why: why.trim(), difficulty, owner_id: user!.id })
      .select()
      .single()

    if (error || !task) { setLoading(false); Alert.alert('Error', 'Could not create task. Please try again.'); return }

    // Create reminder_requests for each friend + notifications.
    // Track which friends failed so we can surface a clear message instead of
    // silently leaving some friends un-notified.
    const failed: string[] = []
    await Promise.all(selectedFriends.map(async (friend) => {
      const { data: request, error: reqError } = await supabase
        .from('reminder_requests')
        .insert({
          task_id: task.id,
          requester_id: user!.id,
          assignee_id: friend.id,
          scheduled_at: scheduledAt.toISOString(),
          repeat_count: repeatCount,
          interval_minutes: intervalMinutes,
          notification_type: notificationType,
        })
        .select()
        .single()

      if (reqError || !request) {
        failed.push(friend.username)
        return
      }

      const { error: notifError } = await supabase.from('notifications').insert({
        recipient_id: friend.id,
        type: 'reminder_request',
        payload: {
          task_id: task.id,
          task_title: task.title,
          request_id: request.id,
          from_username: username ?? user!.email,
        },
      })
      // The request saved but the notification didn't — the friend will still
      // see it in their Inbox (realtime), they just won't get a push. Count it
      // as a partial failure so the user knows to follow up.
      if (notifError) failed.push(friend.username)
    }))

    setLoading(false)

    if (failed.length) {
      const names = failed.map(n => `@${n}`).join(', ')
      Alert.alert(
        'Some friends weren’t reached',
        `Your task was created, but we couldn’t send the request to ${names}. Open the task to try again.`,
      )
    }

    navigation.replace('TaskDetail', { taskId: task.id })
  }

  function goBack() {
    if (step === 1) navigation.goBack()
    else setStep(s => s - 1)
  }

  const totalSteps = 4
  const canAdvance = [
    title.trim().length > 0,
    true,
    selectedFriends.length > 0,
    true,
  ][step - 1]

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Progress bar */}
      <View className="flex-row px-4 pt-2 pb-3 gap-1.5">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <View
            key={i}
            className={`flex-1 h-1 rounded-full ${i < step ? 'bg-orange-500' : 'bg-gray-200'}`}
          />
        ))}
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 20, gap: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Step 1: Title + Why ── */}
        {step === 1 && (
          <View className="gap-5">
            <View>
              <Text className="text-2xl font-bold text-gray-900 mb-1">What's the task?</Text>
              <Text className="text-gray-400 text-sm">Give it a clear, specific name.</Text>
            </View>
            <TextInput
              className="bg-white border border-gray-200 rounded-2xl px-4 py-4 text-base"
              placeholder="e.g. Submit tax return"
              value={title}
              onChangeText={setTitle}
              returnKeyType="next"
              autoFocus
            />
            <View>
              <Text className="text-base font-semibold text-gray-900 mb-1">Why does this matter? 💡</Text>
              <Text className="text-gray-400 text-xs mb-2">Your friend will see this — make it real.</Text>
              <TextInput
                className="bg-white border border-gray-200 rounded-2xl px-4 py-4 text-sm"
                placeholder="e.g. If I miss this deadline I'll get a fine"
                value={why}
                onChangeText={setWhy}
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />
            </View>
          </View>
        )}

        {/* ── Step 2: Difficulty ── */}
        {step === 2 && (
          <View className="gap-5">
            <View>
              <Text className="text-2xl font-bold text-gray-900 mb-1">How hard is this?</Text>
              <Text className="text-gray-400 text-sm">Be honest — it helps your friend understand.</Text>
            </View>
            <View className="gap-3">
              {DIFFICULTIES.map(d => {
                const selected = difficulty === d.value
                return (
                  <TouchableOpacity
                    key={d.value}
                    onPress={() => setDifficulty(d.value)}
                    className="flex-row items-center justify-between px-5 py-4 rounded-2xl border"
                    style={{
                      backgroundColor: selected ? difficultyColor(d.value, 1) : difficultyColor(d.value, 0.12),
                      borderColor: difficultyColor(d.value, selected ? 1 : 0.45),
                      borderWidth: selected ? 1.5 : 1,
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      className="font-semibold"
                      style={{ color: selected ? '#ffffff' : difficultyTextColor(d.value) }}
                    >
                      {d.desc}
                    </Text>
                    <View
                      style={{
                        width: 14, height: 14, borderRadius: 7,
                        backgroundColor: selected ? '#ffffff' : difficultyColor(d.value, 1),
                      }}
                    />
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        )}

        {/* ── Step 3: Pick Friends ── */}
        {step === 3 && (
          <View className="gap-5">
            <View>
              <Text className="text-2xl font-bold text-gray-900 mb-1">Who will remind you?</Text>
              <Text className="text-gray-400 text-sm">Select one or more friends.</Text>
            </View>
            {!friends.length ? (
              <View className="bg-white rounded-2xl p-6 items-center border border-gray-100">
                <Text className="text-gray-400 text-sm text-center">No friends yet. Add some in the Friends tab first.</Text>
              </View>
            ) : (
              <View className="gap-2">
                {friends.map(f => {
                  const selected = !!selectedFriends.find(s => s.id === f.id)
                  return (
                    <TouchableOpacity
                      key={f.id}
                      onPress={() => toggleFriend(f)}
                      className={`flex-row items-center justify-between px-5 py-4 rounded-2xl border ${
                        selected ? 'bg-orange-50 border-orange-400' : 'bg-white border-gray-200'
                      }`}
                      activeOpacity={0.7}
                    >
                      <View className="flex-row items-center gap-3">
                        <View className={`w-8 h-8 rounded-full items-center justify-center ${selected ? 'bg-orange-500' : 'bg-gray-100'}`}>
                          <Text className={`font-bold text-sm ${selected ? 'text-white' : 'text-gray-500'}`}>
                            {f.username[0].toUpperCase()}
                          </Text>
                        </View>
                        <Text className={`font-medium ${selected ? 'text-orange-700' : 'text-gray-700'}`}>@{f.username}</Text>
                      </View>
                      {selected && <Ionicons name="checkmark-circle" size={22} color="#f97316" />}
                    </TouchableOpacity>
                  )
                })}
              </View>
            )}
          </View>
        )}

        {/* ── Step 4: Schedule ── */}
        {step === 4 && (
          <View className="gap-5">
            {/* Selected friends summary */}
            <View>
              <Text className="text-2xl font-bold text-gray-900 mb-1">Set the schedule</Text>
              <View className="flex-row flex-wrap gap-1 mt-1">
                {selectedFriends.map(f => (
                  <View key={f.id} className="bg-orange-100 rounded-full px-3 py-1">
                    <Text className="text-orange-700 text-sm font-medium">@{f.username}</Text>
                  </View>
                ))}
                <Text className="text-gray-400 text-sm self-center">will remind you</Text>
              </View>
            </View>

            {/* First reminder time */}
            <View>
              <Text className="text-sm font-semibold text-gray-700 mb-2">First reminder at</Text>
              <TouchableOpacity
                onPress={() => setShowPicker(true)}
                className="bg-white border border-gray-200 rounded-2xl px-4 py-4"
                activeOpacity={0.7}
              >
                <Text className="text-gray-700">{scheduledAt.toLocaleString()}</Text>
              </TouchableOpacity>
              {showPicker && (
                <DateTimePicker
                  value={scheduledAt}
                  mode="datetime"
                  minimumDate={new Date()}
                  onChange={(_, date) => { setShowPicker(false); if (date) setScheduledAt(date) }}
                />
              )}
            </View>

            {/* Number of reminders */}
            <View>
              <Text className="text-sm font-semibold text-gray-700 mb-2">Number of reminders</Text>
              <View className="flex-row gap-2">
                {[1, 2, 3, 4, 5].map(n => (
                  <TouchableOpacity
                    key={n}
                    onPress={() => setRepeatCount(n)}
                    className={`flex-1 py-3 rounded-2xl items-center border ${
                      repeatCount === n ? 'bg-orange-500 border-orange-500' : 'bg-white border-gray-200'
                    }`}
                    activeOpacity={0.7}
                  >
                    <Text className={`font-semibold ${repeatCount === n ? 'text-white' : 'text-gray-600'}`}>{n}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Interval */}
            {repeatCount > 1 && (
              <View>
                <Text className="text-sm font-semibold text-gray-700 mb-2">Interval between reminders</Text>
                <View className="flex-row flex-wrap gap-2">
                  {INTERVALS.map(i => (
                    <TouchableOpacity
                      key={i.value}
                      onPress={() => setIntervalMinutes(i.value)}
                      className={`px-4 py-2 rounded-full border ${
                        intervalMinutes === i.value ? 'bg-orange-500 border-orange-500' : 'bg-white border-gray-200'
                      }`}
                      activeOpacity={0.7}
                    >
                      <Text className={`text-sm font-medium ${intervalMinutes === i.value ? 'text-white' : 'text-gray-600'}`}>
                        {i.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            )}

            {/* Notification type */}
            <View>
              <Text className="text-sm font-semibold text-gray-700 mb-2">Notification style</Text>
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => setNotificationType('standard')}
                  className={`flex-1 py-3 rounded-2xl items-center border ${
                    notificationType === 'standard' ? 'bg-orange-500 border-orange-500' : 'bg-white border-gray-200'
                  }`}
                  activeOpacity={0.7}
                >
                  <Text className={`text-sm font-medium ${notificationType === 'standard' ? 'text-white' : 'text-gray-600'}`}>
                    🔔 Standard
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setNotificationType('time_sensitive')}
                  className={`flex-1 py-3 rounded-2xl items-center border ${
                    notificationType === 'time_sensitive' ? 'bg-orange-500 border-orange-500' : 'bg-white border-gray-200'
                  }`}
                  activeOpacity={0.7}
                >
                  <Text className={`text-sm font-medium ${notificationType === 'time_sensitive' ? 'text-white' : 'text-gray-600'}`}>
                    ⚡ Time Sensitive
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Bottom nav */}
      <View className="px-4 pb-8 pt-3 flex-row gap-3 bg-gray-50 border-t border-gray-100">
        <TouchableOpacity
          onPress={goBack}
          className="w-12 h-12 rounded-2xl bg-white border border-gray-200 items-center justify-center"
          activeOpacity={0.7}
        >
          <Ionicons name="arrow-back" size={20} color="#6b7280" />
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => step < totalSteps ? setStep(s => s + 1) : handleSubmit()}
          disabled={!canAdvance || loading || (step === 3 && !friends.length)}
          className="flex-1 bg-orange-500 rounded-2xl py-3 items-center justify-center disabled:opacity-50"
          activeOpacity={0.8}
        >
          {loading ? <ActivityIndicator color="#fff" /> : (
            <Text className="text-white font-semibold text-base">
              {step < totalSteps ? 'Next →' : 'Create Task'}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}
