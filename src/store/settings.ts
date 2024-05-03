import { defineStore } from 'pinia'
import { Settings } from '../../@types/electron-window'
import { Sound } from '@/@types/sound'
import { openDB } from 'idb'
import { File } from '@/@types/file'
import { v4 } from 'uuid'
import { useSoundStore } from './sound'

interface State {
  outputDevices: string[]
  darkMode: boolean
  allowOverlappingSound: boolean
  sounds: Sound[]
  displayMode: DisplayMode
  currentEditingSound: Sound | null
}

type BooleanSettings = 'darkMode' | 'allowOverlappingSound'
type ArraySoundSettings = 'sounds'
type ArraySettings = 'outputDevices'
export type DisplayMode = 'edit' | 'play'

export interface SettingsStore extends ReturnType<typeof useSettingsStore> {}

export const useSettingsStore = defineStore('settings', {
  state: (): State => ({
    outputDevices: [],
    darkMode: true,
    allowOverlappingSound: false,
    sounds: [],
    displayMode: 'play',
    currentEditingSound: null,
  }),
  actions: {
    async getOutputDevices(): Promise<MediaDeviceInfo[]> {
      const devices = await navigator.mediaDevices.enumerateDevices()
      return devices.filter(device => device.kind === 'audiooutput')
    },
    async toggleDisplayMode(): Promise<void> {
      this.displayMode = this.displayMode === 'play' ? 'edit' : 'play'
    },
    /**
     * Save an array setting to the store
     * @param key the key it's saved under
     * @param value the value to save
     * @returns true if saved successfully
     */
    async saveStringArray(key: ArraySettings, value: string[]): Promise<boolean> {
      const electron: Settings | undefined = window.electron
      await electron?.saveSetting?.(key, JSON.stringify(value))
      this[key] = value
      return true
    },
    /**
     * Fetch an array setting from the store
     * @param key the key it's saved under
     * @param defaultValue the default value if it's not set, default to []
     * @returns the value of the setting
     */
    async fetchStringArray(key: ArraySettings, defaultValue?: string[]): Promise<string[]> {
      const soundStore = useSoundStore()
      const electron: Settings | undefined = window.electron
      const returnedArray = await electron?.readSetting?.(key)
      if (returnedArray === undefined) {
        if (key === 'outputDevices') {
          const devices = await navigator.mediaDevices.enumerateDevices()
          const audioOutputDevices = devices.filter(device => device.kind === 'audiooutput')
          defaultValue = [audioOutputDevices.length > 0 ? audioOutputDevices[0].deviceId : 'default']
        }
        await electron?.saveSetting?.(key, JSON.stringify(defaultValue))
        this[key] = defaultValue ?? []
      } else if (typeof returnedArray === 'string') {
        this[key] = JSON.parse(returnedArray)
      }
      if (key === 'outputDevices') {
        soundStore.populatePlayingAudio(this[key].length)
      }

      return this[key]
    },
    async saveSoundArray(key: ArraySoundSettings, value: Sound[]): Promise<boolean> {
      const electron: Settings | undefined = window.electron
      await electron?.saveSetting?.(key, JSON.stringify(value))
      this[key] = value
      return true
    },
    /**
     * Fetch an array setting from the store
     * @param key the key it's saved under
     * @param defaultValue the default value if it's not set, default to [{ id: v4() }]
     * @returns the value of the setting
     */
    async fetchSoundSetting(key: ArraySoundSettings, defaultValue: Sound[] = [{ id: v4() }]): Promise<Sound[]> {
      const electron: Settings | undefined = window.electron
      const returnedArray = await electron?.readSetting?.(key)
      if (returnedArray === undefined || typeof returnedArray !== 'string') {
        await electron?.saveSetting?.(key, JSON.stringify(defaultValue))
        this[key] = defaultValue
      } else {
        return this._getImageUrls(key, JSON.parse(returnedArray))
      }

      return this[key]
    },
    /**
     * Get the image URLs for the sounds.
     * @param sounds the array of sounds
     * @returns the array of sounds with image URLs
     */
    async _getImageUrls(key: ArraySoundSettings, sounds: Sound[]) {
      if (key === 'sounds') {
        for (const sound of sounds) {
          if (sound.imageUrl === undefined && sound.imageKey !== undefined) {
            const imageUrl = await this.getFile(sound.imageKey)
            if (imageUrl) {
              sound.imageUrl = imageUrl
            }
          }
        }
      }
      return sounds
    },
    /**
     * Save a sound to the store
     * @param file the sound to save
     */
    async saveFile(file: File) {
      // Open (or create) the database
      const db = await openDB('pulse-panel', 1, {
        upgrade(db) {
          db.createObjectStore('sounds')
        },
      })

      // Store the file in the database so it can be accessed later
      const key = v4()
      await db.put('sounds', file, key)

      // Create a blob URL that points to the file data
      return { fileUrl: URL.createObjectURL(file), fileKey: key }
    },
    /**
     * Fetch a sound from the store
     * @param path the key it's saved under
     * @returns the value of the URL to the file
     */
    async getFile(key: string): Promise<string | null> {
      // open the database
      const db = await openDB('pulse-panel', 1)

      // get the file from the database
      const file = await db.get('sounds', key)

      if (file) {
        // Create a blob URL that points to the file data
        return URL.createObjectURL(file)
      }
      return null
    },
    /**
     * Delete a sound from the store
     * @param path the key it's saved under
     */
    async deleteFile(path: string | undefined): Promise<void> {
      if (path === undefined) return
      // open the database
      const db = await openDB('pulse-panel', 1)

      // delete the file from the database
      await db.delete('sounds', path)
    },
    async replaceFile(oldPath: string | undefined, newFile: File): Promise<{ fileUrl: string; fileKey: string }> {
      if (oldPath) {
        await this.deleteFile(oldPath)
      }
      return this.saveFile(newFile)
    },
    /**
     * Fetch a boolean setting from the store
     * @param key the key it's saved under
     * @param defaultValue the default value if it's not set, default to false
     * @returns the value of the setting
     */
    async fetchBooleanSetting(key: BooleanSettings, defaultValue: boolean = false): Promise<boolean> {
      const electron: Settings | undefined = window.electron
      const returnedBoolean = await electron?.readSetting?.(key)
      if (returnedBoolean === undefined) {
        await electron?.saveSetting?.(key, defaultValue)
        this[key] = defaultValue
      } else {
        this[key] = !!returnedBoolean // default to true
      }

      return this[key]
    },
    /**
     * Save a boolean setting to the store
     * @param key the key it's saved under
     * @param value the value to save
     * @returns true if saved successfully
     */
    async saveBoolean(key: BooleanSettings, value: boolean): Promise<boolean> {
      const electron: Settings | undefined = window.electron
      await electron?.saveSetting(key, value)
      this[key] = value
      if (key === 'darkMode') {
        // notify the main process to toggle dark mode
        window.electron?.toggleDarkMode(value)
      }
      return true // saved successfully
    },
  },
})
