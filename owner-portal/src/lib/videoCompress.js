// Clientseitige Video-Komprimierung vor dem Upload (auf YouTube-Niveau: bis
// 1080p + hoehere Bitrate). Nutzt Canvas + MediaRecorder, Ausgabe = MP4/H.264.
// Faellt bei fehlender Browser-Unterstuetzung auf das Original zurueck.
// Transcoding laeuft in Echtzeit; fuer sehr lange Videos besser den
// YouTube-Link nutzen.

export async function compressVideo(file, { maxDim = 1920, targetBitrate = 6_000_000, onProgress } = {}) {
  if (!file || !file.type || !file.type.startsWith('video/')) return file
  if (typeof MediaRecorder === 'undefined' || typeof document === 'undefined') return file

  const url = URL.createObjectURL(file)
  try {
    const video = document.createElement('video')
    video.src = url
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    await new Promise((res, rej) => {
      video.onloadedmetadata = res
      video.onerror = () => rej(new Error('metadata'))
    })

    const vw = video.videoWidth, vh = video.videoHeight
    if (!vw || !vh) return file
    const scale = Math.min(1, maxDim / Math.max(vw, vh))
    const w = Math.max(2, Math.round((vw * scale) / 2) * 2)
    const h = Math.max(2, Math.round((vh * scale) / 2) * 2)

    const canvas = document.createElement('canvas')
    canvas.width = w; canvas.height = h
    const ctx = canvas.getContext('2d')

    const canvasStream = canvas.captureStream(30)
    // Audio-Spur aus dem Quell-Element holen (falls vorhanden)
    let audioTracks = []
    try {
      const srcStream = video.captureStream ? video.captureStream()
        : (video.mozCaptureStream ? video.mozCaptureStream() : null)
      if (srcStream) audioTracks = srcStream.getAudioTracks()
    } catch { /* ohne Audio weiter */ }

    const stream = new MediaStream([...canvasStream.getVideoTracks(), ...audioTracks])
    // Nur MP4/H.264 erzeugen (überall abspielbar, auch Safari). Kann der Browser
    // kein MP4 aufnehmen (z. B. Chrome → nur WebM), lieber das Original behalten,
    // sonst könnten iOS-/Safari-Nutzer das Video nicht abspielen.
    const mp4 = ['video/mp4;codecs=h264,aac', 'video/mp4;codecs=avc1', 'video/mp4']
      .find(m => MediaRecorder.isTypeSupported(m))
    if (!mp4) return file
    const mime = mp4

    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: targetBitrate })
    const chunks = []
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data) }
    const stopped = new Promise(res => { rec.onstop = res })

    rec.start(1000)
    await video.play()

    let raf
    const draw = () => {
      ctx.drawImage(video, 0, 0, w, h)
      if (onProgress && video.duration) onProgress(Math.min(1, video.currentTime / video.duration))
      raf = requestAnimationFrame(draw)
    }
    draw()

    await new Promise(res => { video.onended = res })
    cancelAnimationFrame(raf)
    rec.stop()
    await stopped

    const blob = new Blob(chunks, { type: 'video/mp4' })
    const name = (file.name || 'video').replace(/\.[^.]+$/, '') + '.mp4'
    const out = new File([blob], name, { type: 'video/mp4' })
    // Nur verwenden, wenn tatsächlich kleiner (sonst Original behalten)
    return out.size > 0 && out.size < file.size ? out : file
  } catch (e) {
    console.warn('compressVideo fallback (Original):', e)
    return file
  } finally {
    URL.revokeObjectURL(url)
  }
}
