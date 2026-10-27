const KEY = 'finping_user_name'

export function getUserName() {
  try { return localStorage.getItem(KEY) || '' } catch (e) { return '' }
}

export function setUserName(name) {
  try { localStorage.setItem(KEY, name) } catch (e) {}
}
