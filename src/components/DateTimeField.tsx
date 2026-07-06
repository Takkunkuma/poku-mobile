import React, { useState } from 'react'
import { View, Text, TouchableOpacity, Platform } from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { formatDateTime } from '@/lib/datetime'

type Props = {
  value: Date
  onChange: (date: Date) => void
  minimumDate?: Date
  mode?: 'datetime' | 'date' | 'time'
}

// A tappable field that opens a date/time picker.
//
// On iOS we render an inline spinner that stays open while you scroll and only
// commits when you tap Done — so you can keep scrolling to the right time
// instead of the picker confirming + closing the instant you pause (the old,
// annoying behavior where every onChange tick closed the picker).
export default function DateTimeField({ value, onChange, minimumDate, mode = 'datetime' }: Props) {
  const [open, setOpen] = useState(false)
  const [temp, setTemp] = useState(value)

  function openPicker() {
    setTemp(value)
    setOpen(true)
  }

  function confirm() {
    onChange(temp)
    setOpen(false)
  }

  return (
    <View>
      <TouchableOpacity
        onPress={openPicker}
        className="border border-gray-200 rounded-2xl px-4 py-3 bg-white"
        activeOpacity={0.7}
      >
        <Text className="text-gray-700 text-sm">{formatDateTime(value)}</Text>
      </TouchableOpacity>

      {open && Platform.OS === 'ios' && (
        <View className="bg-white border border-gray-100 rounded-2xl mt-2 p-1">
          <DateTimePicker
            value={temp}
            mode={mode}
            display="spinner"
            minimumDate={minimumDate}
            onChange={(_, date) => { if (date) setTemp(date) }}
          />
          <View className="flex-row justify-end gap-1 px-2 pb-1">
            <TouchableOpacity onPress={() => setOpen(false)} className="px-4 py-2" activeOpacity={0.7}>
              <Text className="text-gray-500 font-medium">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirm} className="px-4 py-2 bg-orange-500 rounded-xl" activeOpacity={0.8}>
              <Text className="text-white font-semibold">Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Android shows its own modal dialog with OK/Cancel, so the inline
          pattern isn't needed — commit on change and close. */}
      {open && Platform.OS === 'android' && (
        <DateTimePicker
          value={temp}
          mode={mode}
          minimumDate={minimumDate}
          onChange={(_, date) => { setOpen(false); if (date) onChange(date) }}
        />
      )}
    </View>
  )
}
