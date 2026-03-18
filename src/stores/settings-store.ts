import { create } from 'zustand'
import { chromeStorage } from '../services/storage/chrome-storage'
import { DEFAULT_SETTINGS } from '../types/task.types'
import type { AppSettings } from '../types/task.types'

interface SettingsStore {
  settings: AppSettings
  isLoaded: boolean

  // Actions
  load: () => Promise<void>
  save: (settings: AppSettings) => Promise<void>
  patch: (patch: Partial<AppSettings>) => Promise<void>
}

export const useSettingsStore = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  isLoaded: false,

  load: async () => {
    const settings = await chromeStorage.getSettings()
    set({ settings, isLoaded: true })
  },

  save: async (settings) => {
    await chromeStorage.saveSettings(settings)
    set({ settings })
  },

  patch: async (patch) => {
    const updated = await chromeStorage.patchSettings(patch)
    set({ settings: updated })
  },
}))
