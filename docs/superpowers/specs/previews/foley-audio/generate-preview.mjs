import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const outputDir = path.dirname(fileURLToPath(import.meta.url))
const runtimeAudioDir = path.join(outputDir, '..', 'runtime-audio')
const sampleRate = 44100
const mixGain = 0.72

function assert(condition, message) {
  if (!condition) throw new Error(`Validation failed: ${message}`)
}

function mulberry32(seed) {
  return function random() {
    let value = seed += 0x6d2b79f5
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

function clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, value))
}

function smoothstep(value) {
  const x = clamp(value)
  return x * x * (3 - 2 * x)
}

function edgeEnvelope(time, duration, attack = 0.006, release = 0.03) {
  return smoothstep(time / attack) * smoothstep((duration - time) / release)
}

function pulseEnvelope(time, start, attack, decay) {
  const local = time - start
  if (local < 0) return 0
  return smoothstep(local / attack) * Math.exp(-local / decay)
}

function oscillatorSample(kind, phase) {
  if (kind === 'triangle') return Math.asin(Math.sin(phase)) * 2 / Math.PI
  if (kind === 'soft-square') return Math.tanh(Math.sin(phase) * 2.25) / Math.tanh(2.25)
  return Math.sin(phase)
}

function createSound(duration, render) {
  const length = Math.ceil(sampleRate * duration)
  const data = new Float32Array(length)
  for (let i = 0; i < length; i++) {
    const time = i / sampleRate
    const progress = i / (length - 1)
    data[i] = render({ i, time, progress, duration })
  }
  data[0] = 0
  data[length - 1] = 0
  return data
}

function synthesizeMissileHit() {
  const duration = 0.32
  const random = mulberry32(0x4d484954)
  let boomPhase = 0
  let noiseLow = 0
  let noiseSlower = 0
  return createSound(duration, ({ time, progress }) => {
    const white = random() * 2 - 1
    noiseLow += 0.18 * (white - noiseLow)
    noiseSlower += 0.045 * (white - noiseSlower)
    const bandNoise = noiseLow - noiseSlower
    boomPhase += Math.PI * 2 * (132 - 76 * progress) / sampleRate
    const impact = Math.sin(boomPhase) * Math.exp(-time / 0.105) * 0.23
    const burst = bandNoise * Math.exp(-time / 0.082) * 0.29
    const debris = Math.sin(Math.PI * 2 * 680 * time) * pulseEnvelope(time, 0.045, 0.003, 0.036) * 0.045
    return (impact + burst + debris) * edgeEnvelope(time, duration, 0.003, 0.04)
  })
}

function synthesizeMechanicalExplosion() {
  const duration = 0.38
  const random = mulberry32(0x4d454348)
  let thudPhase = 0
  let noiseFast = 0
  let noiseSlow = 0
  return createSound(duration, ({ time, progress }) => {
    const white = random() * 2 - 1
    noiseFast += 0.22 * (white - noiseFast)
    noiseSlow += 0.05 * (white - noiseSlow)
    thudPhase += Math.PI * 2 * (118 - 72 * progress) / sampleRate
    const thud = oscillatorSample('soft-square', thudPhase) * Math.exp(-time / 0.11) * 0.18
    const breakNoise = (noiseFast - noiseSlow) * Math.exp(-time / 0.12) * 0.25
    const clankA = Math.sin(Math.PI * 2 * 720 * time) * pulseEnvelope(time, 0.055, 0.002, 0.038) * 0.08
    const clankB = Math.sin(Math.PI * 2 * 505 * time) * pulseEnvelope(time, 0.12, 0.002, 0.05) * 0.065
    const clankC = Math.sin(Math.PI * 2 * 940 * time) * pulseEnvelope(time, 0.185, 0.002, 0.032) * 0.04
    return (thud + breakNoise + clankA + clankB + clankC) * edgeEnvelope(time, duration, 0.003, 0.035)
  })
}

function synthesizeSoftExplosion() {
  const duration = 0.42
  const random = mulberry32(0x534f4654)
  let bodyPhase = 0
  let shimmerPhase = 0
  let noiseLow = 0
  return createSound(duration, ({ time, progress }) => {
    const white = random() * 2 - 1
    noiseLow += 0.095 * (white - noiseLow)
    bodyPhase += Math.PI * 2 * (106 - 48 * progress) / sampleRate
    shimmerPhase += Math.PI * 2 * (410 - 180 * progress) / sampleRate
    const body = Math.sin(bodyPhase) * Math.exp(-time / 0.15) * 0.17
    const puff = noiseLow * Math.sin(Math.PI * clamp(time / 0.09)) * Math.exp(-time / 0.17) * 0.2
    const shimmer = Math.sin(shimmerPhase) * Math.sin(Math.PI * progress) * (1 - progress) ** 1.6 * 0.055
    return (body + puff + shimmer) * edgeEnvelope(time, duration, 0.008, 0.06)
  })
}

function synthesizeBossExplosion() {
  const duration = 0.86
  const random = mulberry32(0x424f5353)
  let rumblePhase = 0
  let noiseLow = 0
  let noiseSlow = 0
  const pulses = [0, 0.13, 0.29, 0.47]
  return createSound(duration, ({ time, progress }) => {
    const white = random() * 2 - 1
    noiseLow += 0.12 * (white - noiseLow)
    noiseSlow += 0.025 * (white - noiseSlow)
    rumblePhase += Math.PI * 2 * (76 - 37 * progress) / sampleRate
    const rumble = Math.sin(rumblePhase) * Math.exp(-time / 0.36) * 0.18
    let body = 0
    let debris = 0
    for (let index = 0; index < pulses.length; index++) {
      const pulse = pulseEnvelope(time, pulses[index], 0.004, 0.075 + index * 0.012)
      body += Math.sin(Math.PI * 2 * (92 - index * 9) * (time - pulses[index])) * pulse * (0.13 - index * 0.014)
      debris += (noiseLow - noiseSlow) * pulse * (0.22 - index * 0.025)
    }
    const settling = noiseSlow * Math.sin(Math.PI * progress) * (1 - progress) * 0.11
    return (rumble + body + debris + settling) * edgeEnvelope(time, duration, 0.004, 0.1)
  })
}

function synthesizeHurt() {
  const duration = 0.22
  const random = mulberry32(0x48555254)
  let phase = 0
  let noiseLow = 0
  return createSound(duration, ({ time, progress }) => {
    const white = random() * 2 - 1
    noiseLow += 0.16 * (white - noiseLow)
    phase += Math.PI * 2 * (235 - 105 * progress) / sampleRate
    const body = oscillatorSample('triangle', phase) * Math.sin(Math.PI * progress) * (1 - progress) ** 0.65 * 0.2
    const knock = noiseLow * Math.exp(-time / 0.045) * 0.12
    return (body + knock) * edgeEnvelope(time, duration, 0.004, 0.035)
  })
}

function synthesizeMachinegun(seed, frequencyOffset = 0, noiseAmount = 0.09) {
  const duration = 0.052
  const random = mulberry32(seed)
  let phase = 0
  let noiseLow = 0
  return createSound(duration, ({ time, progress }) => {
    const white = random() * 2 - 1
    noiseLow += 0.24 * (white - noiseLow)
    const frequency = 230 + frequencyOffset - 118 * progress
    phase += Math.PI * 2 * frequency / sampleRate
    const body = oscillatorSample('soft-square', phase) * (1 - progress) ** 1.75 * 0.15
    const click = (white - noiseLow) * Math.exp(-time / 0.012) * noiseAmount
    return (body + click) * edgeEnvelope(time, duration, 0.0015, 0.009)
  })
}

function synthesizeHit() {
  const duration = 0.11
  const random = mulberry32(0x48495421)
  let phase = 0
  let noiseLow = 0
  return createSound(duration, ({ time, progress }) => {
    const white = random() * 2 - 1
    noiseLow += 0.18 * (white - noiseLow)
    phase += Math.PI * 2 * (245 - 125 * progress) / sampleRate
    const body = Math.sin(phase) * Math.exp(-time / 0.042) * 0.19
    const tap = noiseLow * Math.exp(-time / 0.024) * 0.14
    return (body + tap) * edgeEnvelope(time, duration, 0.002, 0.018)
  })
}

function synthesizeOrangeShot() {
  const duration = 0.36
  const random = mulberry32(0x4f524e47)
  let phase = 0
  let noiseLow = 0
  let noiseSlow = 0
  return createSound(duration, ({ time, progress }) => {
    const white = random() * 2 - 1
    noiseLow += 0.14 * (white - noiseLow)
    noiseSlow += 0.035 * (white - noiseSlow)
    phase += Math.PI * 2 * (138 - 61 * progress) / sampleRate
    const cannon = oscillatorSample('soft-square', phase) * Math.exp(-time / 0.13) * 0.2
    const airBlast = (noiseLow - noiseSlow) * Math.sin(Math.PI * clamp(time / 0.045)) * Math.exp(-time / 0.12) * 0.27
    const tail = noiseSlow * (1 - progress) ** 1.4 * 0.1
    return (cannon + airBlast + tail) * edgeEnvelope(time, duration, 0.003, 0.055)
  })
}

function synthesizeGameOver() {
  const duration = 0.78
  const notes = [294, 220, 165]
  const starts = [0, 0.22, 0.44]
  const random = mulberry32(0x47414d45)
  let shutdownPhase = 0
  let noiseLow = 0
  return createSound(duration, ({ time, progress }) => {
    const white = random() * 2 - 1
    noiseLow += 0.06 * (white - noiseLow)
    let value = 0
    for (let index = 0; index < notes.length; index++) {
      const local = time - starts[index]
      if (local < 0) continue
      const envelope = smoothstep(local / 0.018) * Math.exp(-local / 0.2)
      value += oscillatorSample('triangle', Math.PI * 2 * notes[index] * local) * envelope * (0.12 - index * 0.012)
      value += Math.sin(Math.PI * 2 * notes[index] * 0.5 * local) * envelope * 0.035
    }
    shutdownPhase += Math.PI * 2 * (138 - 102 * progress ** 0.7) / sampleRate
    const shutdownEnvelope = smoothstep(time / 0.025) * (1 - progress) ** 0.65
    const shutdown = oscillatorSample('soft-square', shutdownPhase) * shutdownEnvelope * 0.075
    const airFade = noiseLow * shutdownEnvelope * 0.065
    return (value + shutdown + airFade) * edgeEnvelope(time, duration, 0.008, 0.1)
  })
}

function synthesizeBossCharge() {
  const duration = 0.36
  const random = mulberry32(0x43485247)
  let bodyPhase = 0
  let energyPhase = 0
  let noiseLow = 0
  return createSound(duration, ({ time, progress }) => {
    const white = random() * 2 - 1
    noiseLow += 0.09 * (white - noiseLow)
    bodyPhase += Math.PI * 2 * (84 + 126 * progress ** 1.25) / sampleRate
    energyPhase += Math.PI * 2 * (210 + 280 * progress ** 1.7) / sampleRate
    const drive = smoothstep(progress / 0.72) * (1 - progress) ** 0.28
    const body = Math.sin(bodyPhase) * drive * 0.16
    const energy = Math.sin(energyPhase) * drive * progress * 0.06
    const rushingAir = noiseLow * drive * 0.12
    const launch = Math.sin(Math.PI * 2 * 106 * (time - 0.27)) * pulseEnvelope(time, 0.27, 0.003, 0.05) * 0.14
    return (body + energy + rushingAir + launch) * edgeEnvelope(time, duration, 0.008, 0.045)
  })
}

function synthesizeMagicBreak() {
  const duration = 0.44
  const random = mulberry32(0x4d414749)
  let noiseLow = 0
  const partials = [940, 1320, 1760]
  return createSound(duration, ({ time, progress }) => {
    const white = random() * 2 - 1
    noiseLow += 0.13 * (white - noiseLow)
    let chime = 0
    for (let index = 0; index < partials.length; index++) {
      const local = time - index * 0.027
      if (local < 0) continue
      chime += Math.sin(Math.PI * 2 * partials[index] * local) * Math.exp(-local / (0.095 + index * 0.025)) * (0.065 - index * 0.008)
    }
    const dust = noiseLow * Math.sin(Math.PI * progress) * (1 - progress) ** 1.35 * 0.13
    const body = Math.sin(Math.PI * 2 * (250 - 95 * progress) * time) * Math.sin(Math.PI * progress) * 0.045
    return (chime + dust + body) * edgeEnvelope(time, duration, 0.004, 0.055)
  })
}

function synthesizeWeaponSwitch() {
  const duration = 0.28
  const random = mulberry32(0x53574954)
  let noiseLow = 0
  return createSound(duration, ({ time, progress }) => {
    const white = random() * 2 - 1
    noiseLow += 0.18 * (white - noiseLow)
    const clickA = (white - noiseLow) * pulseEnvelope(time, 0.012, 0.0015, 0.018) * 0.15
    const clickB = (white - noiseLow) * pulseEnvelope(time, 0.12, 0.0015, 0.024) * 0.14
    const metalA = Math.sin(Math.PI * 2 * 710 * (time - 0.012)) * pulseEnvelope(time, 0.012, 0.002, 0.045) * 0.075
    const metalB = Math.sin(Math.PI * 2 * 530 * (time - 0.12)) * pulseEnvelope(time, 0.12, 0.002, 0.06) * 0.085
    const lock = Math.sin(Math.PI * 2 * (260 + 120 * progress) * time) * pulseEnvelope(time, 0.17, 0.008, 0.055) * 0.055
    return (clickA + clickB + metalA + metalB + lock) * edgeEnvelope(time, duration, 0.003, 0.04)
  })
}

function synthesizeFragment() {
  const duration = 0.18
  const random = mulberry32(0x46524147)
  let noiseLow = 0
  return createSound(duration, ({ time, progress }) => {
    const white = random() * 2 - 1
    noiseLow += 0.2 * (white - noiseLow)
    const chimeA = Math.sin(Math.PI * 2 * 1320 * time) * Math.exp(-time / 0.055) * 0.09
    const chimeB = Math.sin(Math.PI * 2 * 1920 * time) * Math.exp(-time / 0.038) * 0.055
    const tick = (white - noiseLow) * Math.exp(-time / 0.009) * 0.07
    const settle = Math.sin(Math.PI * 2 * 760 * time) * Math.sin(Math.PI * progress) * 0.025
    return (chimeA + chimeB + tick + settle) * edgeEnvelope(time, duration, 0.0015, 0.025)
  })
}

function decodeWav(filePath) {
  const buffer = fs.readFileSync(filePath)
  assert(buffer.toString('ascii', 0, 4) === 'RIFF', `${path.basename(filePath)} has RIFF header`)
  assert(buffer.toString('ascii', 8, 12) === 'WAVE', `${path.basename(filePath)} has WAVE header`)
  assert(buffer.readUInt16LE(20) === 1, `${path.basename(filePath)} uses PCM`)
  assert(buffer.readUInt16LE(22) === 1, `${path.basename(filePath)} is mono`)
  assert(buffer.readUInt32LE(24) === sampleRate, `${path.basename(filePath)} is ${sampleRate} Hz`)
  assert(buffer.readUInt16LE(34) === 16, `${path.basename(filePath)} is PCM16`)
  const dataBytes = buffer.readUInt32LE(40)
  const data = new Float32Array(dataBytes / 2)
  for (let index = 0; index < data.length; index++) data[index] = buffer.readInt16LE(44 + index * 2) / 32768
  return data
}

function encodeWav(samples) {
  const buffer = Buffer.alloc(44 + samples.length * 2)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + samples.length * 2, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(samples.length * 2, 40)
  for (let index = 0; index < samples.length; index++) {
    const value = clamp(samples[index], -1, 1)
    buffer.writeInt16LE(Math.round(value * (value < 0 ? 32768 : 32767)), 44 + index * 2)
  }
  return buffer
}

function mixTimeline(duration, events) {
  const output = new Float32Array(Math.ceil(sampleRate * duration))
  for (const event of events) {
    const offset = Math.round(event.time * sampleRate)
    const gain = event.gain ?? mixGain
    for (let index = 0; index < event.samples.length && offset + index < output.length; index++) {
      output[offset + index] += event.samples[index] * gain
    }
  }
  output[0] = 0
  output[output.length - 1] = 0
  return output
}

function concatenateWithGaps(keys, sounds, gapSeconds = 0.24) {
  const gapLength = Math.round(sampleRate * gapSeconds)
  const totalLength = keys.reduce((sum, key) => sum + sounds[key].length, 0) + gapLength * (keys.length - 1)
  const output = new Float32Array(totalLength)
  let offset = 0
  for (const key of keys) {
    output.set(sounds[key], offset)
    offset += sounds[key].length + gapLength
  }
  output[0] = 0
  output[output.length - 1] = 0
  return output
}

function metrics(samples) {
  let peak = 0
  let sumSquares = 0
  let sum = 0
  for (const sample of samples) {
    assert(Number.isFinite(sample), 'PCM contains only finite samples')
    peak = Math.max(peak, Math.abs(sample))
    sumSquares += sample * sample
    sum += sample
  }
  const rms = Math.sqrt(sumSquares / samples.length)
  return {
    sampleRate,
    channels: 1,
    bitDepth: 16,
    samples: samples.length,
    durationSeconds: samples.length / sampleRate,
    peak,
    peakDbfs: peak ? 20 * Math.log10(peak) : null,
    rms,
    rmsDbfs: rms ? 20 * Math.log10(rms) : null,
    dcOffset: sum / samples.length,
    firstSample: samples[0],
    lastSample: samples[samples.length - 1],
    normalized: false
  }
}

const main = [
  { key: 'missile-hit', name: '导弹命中爆裂', description: '独立于击杀的短促爆裂，含低频撞击、滤波碎屑与轻微金属尾音。', duration: 0.32, originalKey: 'hit' },
  { key: 'explode-mechanical', name: '机械敌机碎裂', description: '普通机械敌机的实体碎裂，低频闷响后跟随三段轻金属散落。', duration: 0.38, originalKey: 'explode' },
  { key: 'explode-soft', name: '生物魔法柔和消散', description: '柔软低频气团、滤波噪声与安静微光尾音，避免尖锐爆炸感。', duration: 0.42, originalKey: 'explode' },
  { key: 'boss-explode', name: 'BOSS 大体量爆炸', description: '多段错开的重击和碎屑脉冲，表现大体量瓦解但保持儿童友好响度。', duration: 0.86, originalKey: 'explode' },
  { key: 'hurt', name: '玩家受伤', description: '清楚但不刺耳的下坠实体音与软质敲击。', duration: 0.22, originalKey: 'hurt' },
  { key: 'machinegun', name: '机枪连射', description: '约 0.052 秒的短促机械脉冲，按 0.09 秒节拍叠加时仍保留间隙。', duration: 0.052, originalKey: 'machinegun' },
  { key: 'hit', name: '普通命中', description: '短小低频触感与柔和滤波敲击，适合高频触发。', duration: 0.11, originalKey: 'hit' },
  { key: 'orange-shot', name: '橙色重炮', description: '低频炮体与滤波气流爆发，强调重炮重量而不产生刺耳高频。', duration: 0.36, originalKey: 'orange-shot' },
  { key: 'game-over', name: '游戏结束', description: '三段缓降的柔和机械音阶叠加减速熄火层，短尾收束失败反馈。', duration: 0.78, originalKey: null },
  { key: 'boss-charge', name: 'BOSS 冲锋', description: '0.36 秒由低到高的实体推进、滤波气流与起冲脉冲，无持续引擎感。', duration: 0.36, originalKey: null },
  { key: 'magic-break', name: '魔法破碎', description: '柔和高频碎光、滤波粉尘与低层消散，不使用尖锐玻璃感。', duration: 0.44, originalKey: null },
  { key: 'weapon-switch', name: '武器切换装配', description: '两段机械卡扣、金属回响和轻微锁定音。', duration: 0.28, originalKey: null },
  { key: 'fragment', name: '武器碎片获得', description: '清脆短亮的双层碎片音，快速衰减以避免刺耳。', duration: 0.18, originalKey: null }
]

const sounds = {
  'missile-hit': synthesizeMissileHit(),
  'explode-mechanical': synthesizeMechanicalExplosion(),
  'explode-soft': synthesizeSoftExplosion(),
  'boss-explode': synthesizeBossExplosion(),
  hurt: synthesizeHurt(),
  machinegun: synthesizeMachinegun(0x4d473031),
  hit: synthesizeHit(),
  'orange-shot': synthesizeOrangeShot(),
  'game-over': synthesizeGameOver(),
  'boss-charge': synthesizeBossCharge(),
  'magic-break': synthesizeMagicBreak(),
  'weapon-switch': synthesizeWeaponSwitch(),
  fragment: synthesizeFragment(),
  'machinegun-2': synthesizeMachinegun(0x4d473032, 8, 0.085),
  'machinegun-3': synthesizeMachinegun(0x4d473033, -7, 0.095)
}

for (const item of main) {
  assert(sounds[item.key].length === Math.ceil(item.duration * sampleRate), `${item.key} duration matches manifest`)
}

const runtimeKeys = [...new Set(main.map(item => item.originalKey).filter(Boolean).concat(['missile-launch', 'laser']))]
const runtime = Object.fromEntries(runtimeKeys.map(key => {
  const filePath = path.join(runtimeAudioDir, `${key}.wav`)
  assert(fs.existsSync(filePath), `runtime source exists: ${key}.wav`)
  return [key, decodeWav(filePath)]
}))

const featuredBattleEvents = [
  { time: 0.15, candidateKey: 'missile-launch', originalKey: 'missile-launch', label: '导弹发射原声保留' },
  { time: 1.52, candidateKey: 'hit', originalKey: 'hit', label: '普通命中' },
  { time: 1.9, candidateKey: 'explode-mechanical', originalKey: 'explode', label: '机械敌机碎裂' },
  { time: 2.48, candidateKey: 'laser', originalKey: 'laser', label: '激光原声保留' },
  { time: 2.92, candidateKey: 'orange-shot', originalKey: 'orange-shot', label: '橙色重炮' },
  { time: 3.58, candidateKey: 'hurt', originalKey: 'hurt', label: '玩家受伤' },
  { time: 4.08, candidateKey: 'missile-launch', originalKey: 'missile-launch', label: '导弹发射原声保留' },
  { time: 4.62, candidateKey: 'missile-hit', originalKey: 'hit', label: '导弹命中爆裂' },
  { time: 5.18, candidateKey: 'explode-soft', originalKey: 'explode', label: '生物魔法消散' },
  { time: 5.78, candidateKey: 'magic-break', originalKey: null, label: '魔法破碎（原版静音）' },
  { time: 6.4, candidateKey: 'weapon-switch', originalKey: null, label: '武器切换（原版静音）' },
  { time: 6.88, candidateKey: 'fragment', originalKey: null, label: '碎片获得（原版静音）' },
  { time: 7.32, candidateKey: 'boss-charge', originalKey: null, label: 'BOSS 冲锋（原版静音）' },
  { time: 8.16, candidateKey: 'boss-explode', originalKey: 'explode', label: 'BOSS 爆炸' },
  { time: 9.12, candidateKey: 'game-over', originalKey: null, label: '游戏结束（原版静音）' }
]

const machinegunKeys = ['machinegun', 'machinegun-2', 'machinegun-3']
const machinegunTimeline = []
for (let index = 0, time = 0.4; time <= 8.9; index++, time = 0.4 + index * 0.09) {
  machinegunTimeline.push({
    time: Number(time.toFixed(2)),
    candidateKey: machinegunKeys[index % machinegunKeys.length],
    originalKey: 'machinegun',
    label: `连续机枪第 ${index + 1} 发`
  })
}
const battleTimeline = [...featuredBattleEvents, ...machinegunTimeline].sort((first, second) => first.time - second.time)

function resolveCandidate(key) {
  return sounds[key] || runtime[key]
}

const battleOriginal = mixTimeline(10, battleTimeline
  .filter(event => event.originalKey)
  .map(event => ({ time: event.time, samples: runtime[event.originalKey] })))
const battleCandidate = mixTimeline(10, battleTimeline.map(event => ({ time: event.time, samples: resolveCandidate(event.candidateKey) })))
const showcase = concatenateWithGaps(main.map(item => item.key), sounds)

const outputs = {
  ...Object.fromEntries(Object.entries(sounds).map(([key, samples]) => [`${key}.wav`, samples])),
  'battle-original.wav': battleOriginal,
  'battle-candidate.wav': battleCandidate,
  'events-showcase.wav': showcase
}

const fileMetrics = {}
for (const [fileName, samples] of Object.entries(outputs)) {
  const rawMetrics = metrics(samples)
  assert(rawMetrics.peak < 1, `${fileName} has no pre-encode clipping`)
  const filePath = path.join(outputDir, fileName)
  fs.writeFileSync(filePath, encodeWav(samples))
  const measured = metrics(decodeWav(filePath))
  assert(Math.abs(measured.firstSample) <= 1e-7, `${fileName} starts at zero`)
  assert(Math.abs(measured.lastSample) <= 1e-7, `${fileName} ends at zero`)
  assert(measured.peak > 0, `${fileName} is not silent`)
  assert(measured.peak < 1, `${fileName} has no clipping`)
  assert(Math.abs(measured.dcOffset) < 0.01, `${fileName} has low DC offset`)
  fileMetrics[fileName] = measured
}

const mixes = [
  {
    key: 'battle-original',
    name: '战斗原声基线',
    file: 'battle-original.wav',
    description: '按同一事件时间表混合当前 runtime WAV；全事件固定增益 0.72，不归一化。',
    duration: 10
  },
  {
    key: 'battle-candidate',
    name: '战斗候选对照',
    file: 'battle-candidate.wav',
    description: '同一事件时间表替换拟物候选；missile-launch 与 laser 继续使用当前 runtime WAV；全事件固定增益 0.72，不归一化。',
    duration: 10
  },
  {
    key: 'events-showcase',
    name: '候选逐项串听',
    file: 'events-showcase.wav',
    description: '13 个主候选按 manifest 顺序串联，相邻项目间隔 0.24 秒。',
    duration: showcase.length / sampleRate
  }
]

const manifest = {
  status: '试听候选，尚未接入游戏；接入需用户试听确认',
  format: { sampleRate, channels: 1, bitDepth: 16, encoding: 'PCM' },
  main: main.map(item => ({ ...item, file: `${item.key}.wav` })),
  variants: [
    { key: 'machinegun-2', name: '机枪缓存变体 2', file: 'machinegun-2.wav', baseKey: 'machinegun', duration: 0.052 },
    { key: 'machinegun-3', name: '机枪缓存变体 3', file: 'machinegun-3.wav', baseKey: 'machinegun', duration: 0.052 }
  ],
  mixes
}

const report = {
  format: manifest.format,
  synthesis: {
    deterministic: true,
    externalDependencies: [],
    design: '短促低频实体冲击、滤波噪声、机械与能量材质；首尾平滑归零；无持续引擎层',
    normalizationApplied: false
  },
  validation: {
    passed: true,
    checks: ['finite PCM', 'first sample zero', 'last sample zero', 'peak below 1.0', 'absolute DC offset below 0.01'],
    note: '峰值、RMS 与 DC 为数字统计，只用于排查削波和异常，不代表实际听感。'
  },
  files: fileMetrics,
  battleMix: {
    durationSeconds: 10,
    fixedEventGain: mixGain,
    normalizationApplied: false,
    preservedRuntimeKeys: ['missile-launch', 'laser'],
    runtimeSourceDirectory: '../runtime-audio',
    events: battleTimeline
  },
  showcase: {
    order: main.map(item => item.key),
    gapSeconds: 0.24
  }
}

fs.writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
fs.writeFileSync(path.join(outputDir, 'metrics.json'), `${JSON.stringify(report, null, 2)}\n`)

console.log(JSON.stringify({
  outputDir,
  mainCandidates: main.length,
  variants: manifest.variants.length,
  mixes: mixes.length,
  validation: report.validation,
  battleOriginal: fileMetrics['battle-original.wav'],
  battleCandidate: fileMetrics['battle-candidate.wav'],
  showcase: fileMetrics['events-showcase.wav']
}, null, 2))
