import './global.css'
import React from 'react'
import { StatusBar } from 'expo-status-bar'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { AuthProvider } from '@/context/AuthContext'
import NotificationProvider from '@/components/NotificationProvider'
import AppNavigator from '@/navigation/AppNavigator'

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationProvider>
          <AppNavigator />
          <StatusBar style="dark" />
        </NotificationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  )
}
