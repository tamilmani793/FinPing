import { useSyncExternalStore } from 'react'

const NAME_KEY = 'finping_user_name'
const PHOTO_KEY = 'finping_profile_photo'

const listeners = new Set()
const notify = () => listeners.forEach(l => l())
const subscribe = l => { listeners.add(l); return () => listeners.delete(l) }

export function getUserName() {
  try { return localStorage.getItem(NAME_KEY) || '' } catch (e) { return '' }
}

export function setUserName(name) {
  try { localStorage.setItem(NAME_KEY, name) } catch (e) {}
  notify()
}

export function getProfilePhoto() {
  try { return localStorage.getItem(PHOTO_KEY) || '' } catch (e) { return '' }
}

export function setProfilePhoto(dataUrl) {
  try { dataUrl ? localStorage.setItem(PHOTO_KEY, dataUrl) : localStorage.removeItem(PHOTO_KEY) } catch (e) { throw new Error('Could not save the photo on this device') }
  notify()
}

// Called after a restore, which writes the name / photo straight into localStorage
export const profileChanged = notify

export const initialsOf = name => {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase()
}

// name + photo, re-rendering whoever uses it when either changes
export function useProfile() {
  const key = useSyncExternalStore(subscribe, () => `${getUserName()}\u0000${getProfilePhoto().length}`)
  void key
  return { name: getUserName(), photo: getProfilePhoto() }
}

// Any picture the user picks -> a square 256px JPEG (about 20 KB), cropped around the middle
export function resizePhoto(file, size = 256) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Choose an image file'))
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const side = Math.min(img.width, img.height)
      const c = document.createElement('canvas')
      c.width = c.height = size
      c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size)
      URL.revokeObjectURL(url)
      resolve(c.toDataURL('image/jpeg', 0.85))
    }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read that image')) }
    img.src = url
  })
}
