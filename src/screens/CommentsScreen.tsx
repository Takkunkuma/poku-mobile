import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  View, Text, FlatList, TextInput, TouchableOpacity,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { fetchComments, postComment, type TaskComment } from '@/lib/comments'
import { formatDateTime } from '@/lib/datetime'
import type { DashboardStackParamList } from '@/navigation/AppNavigator'

type Props = NativeStackScreenProps<DashboardStackParamList, 'Comments'>

// Shared per-task thread: the task owner and every assignee see one
// conversation, Slack-style. System rows (time changes, rejections) render as
// centered activity lines instead of chat bubbles.
export default function CommentsScreen({ route, navigation }: Props) {
  const { taskId, taskTitle } = route.params
  const { user, username } = useAuth()
  const insets = useSafeAreaInsets()
  const [comments, setComments] = useState<TaskComment[]>([])
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const listRef = useRef<FlatList<TaskComment>>(null)

  useLayoutEffect(() => {
    navigation.setOptions({ title: taskTitle ?? 'Comments' })
  }, [navigation, taskTitle])

  async function load() {
    setComments(await fetchComments(taskId))
    setLoading(false)
  }

  useEffect(() => { load() }, [taskId])

  // Live thread — refetch on any new comment for this task. (The realtime
  // payload doesn't include the author join, so a refetch is simplest.)
  useEffect(() => {
    const channel = supabase
      .channel(`comments-${taskId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'task_comments',
        filter: `task_id=eq.${taskId}`,
      }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [taskId])

  async function send() {
    const body = draft.trim()
    if (!body || !user) return
    setSending(true)
    const ok = await postComment({
      taskId,
      taskTitle: taskTitle ?? '',
      authorId: user.id,
      authorUsername: username ?? 'Someone',
      body,
    })
    setSending(false)
    if (ok) {
      setDraft('')
      load()
    }
  }

  if (loading) {
    return <View className="flex-1 items-center justify-center"><ActivityIndicator size="large" color="#f97316" /></View>
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      className="bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        ref={listRef}
        className="flex-1"
        data={comments}
        keyExtractor={c => c.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 12, flexGrow: 1 }}
        onContentSizeChange={() => {
          if (comments.length) listRef.current?.scrollToEnd({ animated: false })
        }}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center py-16">
            <Text className="text-4xl mb-3">💬</Text>
            <Text className="text-gray-400 text-center px-8">
              No comments yet. Use this thread to talk about the task — why it matters, schedule changes, anything.
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          if (item.system) {
            return (
              <View className="items-center my-2">
                <Text className="text-gray-400 text-xs text-center px-6">
                  @{item.author?.username ?? 'someone'} {item.body} · {formatDateTime(item.created_at)}
                </Text>
              </View>
            )
          }
          const mine = item.author_id === user?.id
          return (
            <View className={`mb-2 max-w-[85%] ${mine ? 'self-end' : 'self-start'}`}>
              {!mine && (
                <Text className="text-gray-400 text-xs mb-0.5 ml-1">@{item.author?.username ?? '...'}</Text>
              )}
              <View className={`rounded-2xl px-4 py-2.5 ${mine ? 'bg-orange-500' : 'bg-white border border-gray-100'}`}>
                <Text className={mine ? 'text-white' : 'text-gray-800'}>{item.body}</Text>
              </View>
              <Text className={`text-gray-300 text-[10px] mt-0.5 ${mine ? 'text-right mr-1' : 'ml-1'}`}>
                {formatDateTime(item.created_at)}
              </Text>
            </View>
          )
        }}
      />

      {/* Composer — pinned to the sheet bottom, padded past the home
          indicator / rounded screen corners so nothing gets clipped */}
      <View
        className="flex-row items-end gap-2 px-4 pt-2 bg-white border-t border-gray-100"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}
      >
        <TextInput
          className="flex-1 bg-white border border-gray-200 rounded-2xl px-4 py-3 text-sm max-h-24"
          placeholder="Write a comment..."
          value={draft}
          onChangeText={setDraft}
          multiline
        />
        <TouchableOpacity
          onPress={send}
          disabled={sending || !draft.trim()}
          className="bg-orange-500 rounded-2xl px-4 py-3 items-center justify-center disabled:opacity-50"
          activeOpacity={0.8}
        >
          {sending ? <ActivityIndicator color="#fff" size="small" /> : (
            <Text className="text-white font-semibold text-sm">Send</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  )
}
