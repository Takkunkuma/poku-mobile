import React, { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ActivityIndicator,
  Alert, ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native'
import { useNavigation } from '@react-navigation/native'
import { Ionicons } from '@expo/vector-icons'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'

const MAX_USERNAME_CHANGES = 2

export default function ProfileScreen() {
  const { user, username, points, refreshProfile } = useAuth()
  const navigation = useNavigation()
  const [newUsername, setNewUsername] = useState('')
  const [saving, setSaving] = useState(false)
  const [changesUsed, setChangesUsed] = useState<number | null>(null)
  const [showEdit, setShowEdit] = useState(false)

  async function loadChangesUsed() {
    if (!user) return
    const { data } = await supabase
      .from('users')
      .select('username_changes')
      .eq('id', user.id)
      .single()
    setChangesUsed(data?.username_changes ?? 0)
  }

  React.useEffect(() => { loadChangesUsed() }, [user])

  async function handleUsernameChange() {
    if (!newUsername.trim() || newUsername.length < 3) {
      Alert.alert('Too short', 'Username must be at least 3 characters.')
      return
    }
    if (!/^[a-zA-Z0-9_]+$/.test(newUsername)) {
      Alert.alert('Invalid', 'Only letters, numbers, and underscores allowed.')
      return
    }
    if (changesUsed !== null && changesUsed >= MAX_USERNAME_CHANGES) {
      Alert.alert('Limit reached', 'You can only change your username twice.')
      return
    }

    setSaving(true)
    const { error } = await supabase
      .from('users')
      .update({
        username: newUsername.toLowerCase().trim(),
        username_changes: (changesUsed ?? 0) + 1,
      })
      .eq('id', user!.id)

    if (error) {
      Alert.alert('Error', error.message.includes('unique') ? 'Username already taken.' : error.message)
      setSaving(false)
      return
    }

    await refreshProfile()
    await loadChangesUsed()
    setNewUsername('')
    setShowEdit(false)
    setSaving(false)
    Alert.alert('Done!', 'Username updated.')
  }

  async function signOut() {
    Alert.alert('Sign out', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out', style: 'destructive',
        onPress: async () => { await supabase.auth.signOut() },
      },
    ])
  }

  const changesLeft = changesUsed !== null ? MAX_USERNAME_CHANGES - changesUsed : null

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-gray-50"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        {/* Avatar + identity */}
        <View className="bg-white rounded-2xl p-6 items-center shadow-sm border border-gray-100">
          <View className="w-20 h-20 rounded-full bg-orange-100 items-center justify-center mb-3">
            <Ionicons name="person" size={40} color="#f97316" />
          </View>
          <Text className="text-xl font-bold text-gray-900">@{username}</Text>
          <View className="flex-row items-center gap-1 mt-1">
            <Text className="text-orange-500 font-semibold text-lg">⚡ {points}</Text>
            <Text className="text-gray-400 text-sm">points</Text>
          </View>
        </View>

        {/* Username change */}
        <View className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <View className="flex-row items-center justify-between mb-1">
            <Text className="font-semibold text-gray-900">Username</Text>
            {changesLeft !== null && (
              <Text className="text-xs text-gray-400">{changesLeft} change{changesLeft !== 1 ? 's' : ''} remaining</Text>
            )}
          </View>
          <Text className="text-gray-500 text-sm mb-3">@{username}</Text>

          {!showEdit ? (
            <TouchableOpacity
              onPress={() => {
                if (changesLeft === 0) {
                  Alert.alert('Limit reached', 'You have used all your username changes.')
                  return
                }
                setShowEdit(true)
              }}
              className={`rounded-2xl py-3 items-center border ${changesLeft === 0 ? 'border-gray-200 bg-gray-50' : 'border-orange-200 bg-orange-50'}`}
              activeOpacity={0.7}
            >
              <Text className={`text-sm font-medium ${changesLeft === 0 ? 'text-gray-400' : 'text-orange-600'}`}>
                {changesLeft === 0 ? 'No changes remaining' : 'Change username'}
              </Text>
            </TouchableOpacity>
          ) : (
            <View className="gap-2">
              <TextInput
                className="border border-gray-200 rounded-2xl px-4 py-3 text-sm"
                placeholder="New username"
                value={newUsername}
                onChangeText={setNewUsername}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={20}
                autoFocus
              />
              <View className="flex-row gap-2">
                <TouchableOpacity
                  onPress={() => { setShowEdit(false); setNewUsername('') }}
                  className="flex-1 border border-gray-200 rounded-2xl py-3 items-center"
                  activeOpacity={0.7}
                >
                  <Text className="text-gray-500 text-sm font-medium">Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleUsernameChange}
                  disabled={saving || newUsername.length < 3}
                  className="flex-1 bg-orange-500 rounded-2xl py-3 items-center disabled:opacity-50"
                  activeOpacity={0.8}
                >
                  {saving ? <ActivityIndicator color="#fff" size="small" /> : (
                    <Text className="text-white text-sm font-medium">Save</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Sign out */}
        <TouchableOpacity
          onPress={signOut}
          className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100 flex-row items-center justify-between"
          activeOpacity={0.7}
        >
          <Text className="text-red-500 font-medium">Sign out</Text>
          <Ionicons name="log-out-outline" size={20} color="#ef4444" />
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
