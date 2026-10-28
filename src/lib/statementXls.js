// Reads an old-style Excel file (.xls, "BIFF8" inside an OLE2 container) on this device, no library. Banks still export
// their card statements this way. Returns the cells of the busiest sheet as a table of strings, like the .xlsx reader.

const u16 = (b, o) => b[o] | (b[o + 1] << 8)
const u32 = (b, o) => (b[o] | (b[o + 1] << 8) | (b[o + 2] << 16) | (b[o + 3] << 24)) >>> 0
const ENDOFCHAIN = 0xfffffffe

// ───────── OLE2 container ─────────
function readOle(bytes) {
  const sig = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]
  if (!sig.every((v, i) => bytes[i] === v)) throw new Error('not an OLE file')
  const secSize = 1 << u16(bytes, 30), miniSize = 1 << u16(bytes, 32)
  const dirStart = u32(bytes, 48), miniCutoff = u32(bytes, 56), miniFatStart = u32(bytes, 60)
  const sector = id => bytes.subarray(512 + id * secSize, 512 + (id + 1) * secSize)

  // the FAT: which sector follows which
  const difat = []
  for (let i = 0; i < 109; i++) { const v = u32(bytes, 76 + i * 4); if (v < 0xfffffffa) difat.push(v) }
  let next = u32(bytes, 68)
  for (let n = u32(bytes, 72); n > 0 && next < 0xfffffffa; n--) {
    const s = sector(next)
    for (let i = 0; i < secSize / 4 - 1; i++) { const v = u32(s, i * 4); if (v < 0xfffffffa) difat.push(v) }
    next = u32(s, secSize - 4)
  }
  const fat = []
  for (const id of difat) { const s = sector(id); for (let i = 0; i < secSize / 4; i++) fat.push(u32(s, i * 4)) }

  const chain = (start, table) => { const out = []; for (let id = start, guard = 0; id < 0xfffffffa && guard < 200000; id = table[id], guard++) out.push(id); return out }
  const readChain = (start, table, size, get) => {
    const ids = chain(start, table), parts = ids.map(get)
    const all = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
    let o = 0; for (const p of parts) { all.set(p, o); o += p.length }
    return size != null ? all.subarray(0, size) : all
  }

  // directory entries
  const dir = readChain(dirStart, fat, null, sector)
  const entries = []
  for (let o = 0; o + 128 <= dir.length; o += 128) {
    const len = u16(dir, o + 64)
    let name = ''
    for (let i = 0; i < Math.max(0, len / 2 - 1); i++) name += String.fromCharCode(u16(dir, o + i * 2))
    entries.push({ name, type: dir[o + 66], start: u32(dir, o + 116), size: u32(dir, o + 120) })
  }
  const root = entries.find(e => e.type === 5)
  let miniFat = null, miniStream = null
  const stream = e => {
    if (e.size >= miniCutoff) return readChain(e.start, fat, e.size, sector)
    if (!miniFat) {
      miniFat = []
      const mf = readChain(miniFatStart, fat, null, sector)
      for (let i = 0; i + 4 <= mf.length; i += 4) miniFat.push(u32(mf, i))
      miniStream = readChain(root.start, fat, root.size, sector)
    }
    return readChain(e.start, miniFat, e.size, id => miniStream.subarray(id * miniSize, (id + 1) * miniSize))
  }
  return { entries, stream }
}

// ───────── BIFF8 workbook ─────────
function rkValue(rk) {
  let v
  if (rk & 2) v = rk >> 2
  else { const b = new DataView(new ArrayBuffer(8)); b.setUint32(4, rk & 0xfffffffc, true); b.setUint32(0, 0, true); v = b.getFloat64(0, true) }
  return rk & 1 ? v / 100 : v
}

// the shared string table, which can run over several CONTINUE records
function readSst(chunks) {
  const joined = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0))
  const bounds = []
  let o = 0
  for (const c of chunks) { joined.set(c, o); bounds.push(o); o += c.length }
  const isBound = p => bounds.indexOf(p) > 0
  const total = u32(joined, 4)
  const out = []
  let p = 8
  for (let i = 0; i < total && p + 3 <= joined.length; i++) {
    let cch = u16(joined, p); let flags = joined[p + 2]; p += 3
    let runs = 0, ext = 0
    if (flags & 8) { runs = u16(joined, p); p += 2 }
    if (flags & 4) { ext = u32(joined, p); p += 4 }
    let s = ''
    while (cch > 0) {
      if (isBound(p)) { flags = joined[p]; p += 1 } // a string carried over into the next record repeats its encoding byte
      const wide = flags & 1
      let end = bounds.find(b => b > p) ?? joined.length
      const avail = Math.floor((end - p) / (wide ? 2 : 1))
      const take = Math.min(cch, Math.max(avail, 1))
      for (let k = 0; k < take; k++) { s += wide ? String.fromCharCode(u16(joined, p)) : String.fromCharCode(joined[p]); p += wide ? 2 : 1 }
      cch -= take
    }
    p += runs * 4 + ext
    out.push(s)
  }
  return out
}

export function parseXls(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer)
  let wb
  try {
    const ole = readOle(bytes)
    const e = ole.entries.find(x => x.type === 2 && /^(workbook|book)$/i.test(x.name))
    if (!e) throw new Error('no workbook')
    wb = ole.stream(e)
  } catch (err) {
    throw new Error('This Excel file cannot be read here (it may be password-protected or in an unusual format). Open it in Excel, save it as CSV or .xlsx, and import that.')
  }

  const sst = []
  const sheets = []
  let cur = null, pendingFormula = null
  let p = 0, sstChunks = null
  const flushSst = () => { if (sstChunks) { sst.push(...readSst(sstChunks)); sstChunks = null } }
  while (p + 4 <= wb.length) {
    const type = u16(wb, p), len = u16(wb, p + 2)
    const d = wb.subarray(p + 4, p + 4 + len)
    p += 4 + len
    if (type === 0x3c) { if (sstChunks) sstChunks.push(d); continue }
    flushSst()
    if (type === 0xfc) { sstChunks = [d]; continue }
    if (type === 0x809) { if (u16(d, 2) === 0x10) { cur = { cells: new Map() }; sheets.push(cur) } else cur = null; continue }
    if (!cur) continue
    const put = (r, c, v) => { cur.cells.set(r * 4096 + c, String(v)) }
    if (type === 0xfd) put(u16(d, 0), u16(d, 2), sst[u32(d, 6)] ?? '')
    else if (type === 0x203) put(u16(d, 0), u16(d, 2), new DataView(d.buffer, d.byteOffset + 6, 8).getFloat64(0, true))
    else if (type === 0x27e) put(u16(d, 0), u16(d, 2), rkValue(u32(d, 6)))
    else if (type === 0xbd) { const r = u16(d, 0), c0 = u16(d, 2); for (let i = 0, o = 4; o + 6 <= d.length - 2; i++, o += 6) put(r, c0 + i, rkValue(u32(d, o + 2))) }
    else if (type === 0x204 && d.length > 8) { const n = u16(d, 6); const wide = d.length >= 9 + n * 2 - 1 && d[8] & 1; let s = ''; const start = 9; for (let i = 0; i < n; i++) s += wide ? String.fromCharCode(u16(d, start + i * 2)) : String.fromCharCode(d[start + i]); put(u16(d, 0), u16(d, 2), s) }
    else if (type === 0x06) {
      const r = u16(d, 0), c = u16(d, 2)
      if (d[12] === 0xff && d[13] === 0xff && d[6] === 0) pendingFormula = [r, c] // the text follows in a STRING record
      else put(r, c, new DataView(d.buffer, d.byteOffset + 6, 8).getFloat64(0, true))
    } else if (type === 0x207 && pendingFormula) {
      const n = u16(d, 0); const wide = d[2] & 1; let s = ''
      for (let i = 0; i < n; i++) s += wide ? String.fromCharCode(u16(d, 3 + i * 2)) : String.fromCharCode(d[3 + i])
      put(pendingFormula[0], pendingFormula[1], s); pendingFormula = null
    }
  }
  flushSst()
  if (!sheets.length) throw new Error('No data found in that Excel file')
  const best = sheets.reduce((a, b) => (b.cells.size > a.cells.size ? b : a))
  const rows = new Map()
  let width = 0
  for (const [k, v] of best.cells) { const r = Math.floor(k / 4096), c = k % 4096; if (!rows.has(r)) rows.set(r, []); rows.get(r)[c] = v.trim(); width = Math.max(width, c + 1) }
  return [...rows.keys()].sort((a, b) => a - b).map(r => Array.from({ length: width }, (_, i) => rows.get(r)[i] ?? '')).filter(r => r.some(x => x !== ''))
}
