import React, { useState } from 'react'
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { makeRedirectUri } from 'expo-auth-session'
import { supabase } from '@/lib/supabase'

WebBrowser.maybeCompleteAuthSession()

export default function LandingScreen() {
  const [loading, setLoading] = useState(false)
  const [devLoading, setDevLoading] = useState(false)

  async function devSignIn() {
    setDevLoading(true)
    const { error } = await supabase.auth.signInWithPassword({
      email: 'dev@pokumobile.com',
      password: 'devtest123',
    })
    if (error) Alert.alert('Dev login failed', error.message)
    setDevLoading(false)
  }

  async function signInWithGoogle() {
    setLoading(true)
    try {
      const redirectTo = makeRedirectUri({ scheme: 'poku-mobile', path: 'auth/callback' })

      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true },
      })

      if (error || !data?.url) throw error ?? new Error('No auth URL')

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo)

      if (result.type === 'success') {
        const url = result.url
        const fragment = url.includes('#') ? url.split('#')[1] : url.split('?')[1] ?? ''
        const params = Object.fromEntries(new URLSearchParams(fragment))
        if (params.access_token && params.refresh_token) {
          await supabase.auth.setSession({
            access_token: params.access_token,
            refresh_token: params.refresh_token,
          })
        }
      }
    } catch (e: any) {
      Alert.alert('Sign in failed', e?.message ?? 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <View className="flex-1 bg-orange-50 items-center justify-center px-6">
      <View className="bg-white rounded-3xl shadow-lg p-10 w-full max-w-sm items-center gap-6">
        <Text className="text-5xl">👉</Text>
        <View className="items-center">
          <Text className="text-3xl font-bold text-gray-900">PokU</Text>
          <Text className="mt-2 text-gray-500 text-sm text-center">
            Poke your friends. Get things done.
          </Text>
        </View>
        <TouchableOpacity
          onPress={signInWithGoogle}
          disabled={loading}
          className="w-full flex-row items-center justify-center gap-3 bg-gray-900 rounded-2xl px-6 py-4 disabled:opacity-50"
          activeOpacity={0.8}
        >
          {loading ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-white font-semibold text-base">Continue with Google</Text>
          )}
        </TouchableOpacity>

        {__DEV__ && (
          <TouchableOpacity
            onPress={devSignIn}
            disabled={devLoading}
            className="w-full items-center py-2 disabled:opacity-50"
            activeOpacity={0.6}
          >
            {devLoading ? (
              <ActivityIndicator color="#f97316" size="small" />
            ) : (
              <Text className="text-orange-400 text-xs font-medium">🛠 Dev Login</Text>
            )}
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}
