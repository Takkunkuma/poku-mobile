import React, { useEffect, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/context/AuthContext'
import { registerForPushNotifications } from '@/lib/notifications'

export default function SetupScreen() {
  const { user, refreshProfile } = useAuth()
  const [username, setUsername] = useState('')
  const [loading, setLoading] = useState(false)

  // Request push notification permission as soon as the user lands here.
  // This is the earliest guaranteed point where we have an authenticated user
  // and a visible screen — iOS will show the system permission dialog here.
  useEffect(() => {
    registerForPushNotifications()
  }, [])

  async function handleSubmit() {
    if (!username.trim() || username.length < 3) {
      Alert.alert('Too short', 'Username must be at least 3 characters.')
      return
    }
    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      Alert.alert('Invalid', 'Only letters, numbers, and underscores allowed.')
      return
    }

    setLoading(true)
    const { error } = await supabase
      .from('users')
      .update({ username: username.toLowerCase().trim() })
      .eq('id', user!.id)

    if (error) {
      Alert.alert('Error', error.message.includes('unique') ? 'Username already taken.' : error.message)
      setLoading(false)
      return
    }

    await refreshProfile()
    setLoading(false)
  }

  return (
    <KeyboardAvoidingView
      className="flex-1 bg-orange-50"
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View className="flex-1 items-center justify-center px-6">
        <View className="bg-white rounded-3xl shadow-lg p-8 w-full max-w-sm">
          <Text className="text-2xl font-bold text-gray-900 mb-1">Pick a username</Text>
          <Text className="text-gray-500 text-sm mb-6">Friends will find you by this name.</Text>
          <TextInput
            className="border border-gray-200 rounded-2xl px-4 py-3 text-sm mb-2"
            placeholder="e.g. tatsuo"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={20}
            returnKeyType="done"
            onSubmitEditing={handleSubmit}
          />
          <TouchableOpacity
            onPress={handleSubmit}
            disabled={loading || username.length < 3}
            className="bg-orange-500 rounded-2xl px-6 py-4 items-center mt-2 disabled:opacity-50"
            activeOpacity={0.8}
          >
            {loading ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-semibold text-base">Continue</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  )
}
