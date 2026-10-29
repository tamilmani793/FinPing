import { useEffect, useRef } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapApp } from '@capacitor/app'
import { useStore } from '../store'

// The phone's back button / back swipe (from the left or right edge) goes back one step instead of leaving the app:
//   1. an open sheet or dialog closes
//   2. a screen that opened something inside itself (a card's details, a form, a list page) steps back out of it
//   3. the previous tab comes back
//   4. on Home, with nowhere left to go, it asks before leaving the app
const handlers = [] // innermost last

// A screen calls this while something is open inside it: `useBackHandler(isOpen, () => close())`
export function useBackHandler(active, fn) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    if (!active) return undefined
    const h = () => ref.current()
    handlers.push(h)
    return () => { const i = handlers.lastIndexOf(h); if (i >= 0) handlers.splice(i, 1) }
  }, [active])
}

// returns true when the press was used up by something on screen
export function handleBack() {
  const overlays = document.querySelectorAll('.overlay')
  if (overlays.length) { overlays[overlays.length - 1].click(); return 'closed a sheet' }
  if (handlers.length) { handlers[handlers.length - 1](); return 'stepped back' }
  const s = useStore.getState()
  if (s.tabStack.length) { s.goBackTab(); return 'previous tab' }
  if (s.activeTab !== 'home') { s.setActiveTab('home'); return 'home' }
  s.setExitPrompt(true)
  return 'ask to exit'
}

export function exitApp() {
  if (Capacitor.isNativePlatform()) CapApp.exitApp()
  else useStore.getState().setExitPrompt(false)
}

export function initBackNav() {
  window.finpingBack = handleBack // lets the browser preview / tests press "back"
  if (!Capacitor.isNativePlatform()) return () => {}
  let sub
  CapApp.addListener('backButton', () => handleBack()).then(h => { sub = h })
  return () => sub?.remove()
}
