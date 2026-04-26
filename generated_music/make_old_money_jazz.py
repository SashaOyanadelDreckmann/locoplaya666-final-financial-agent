#!/usr/bin/env python3
import math
import os
import random
import struct
import wave

ROOT = os.path.dirname(os.path.abspath(__file__))
MIDI_PATH = os.path.join(ROOT, "requiem_skeleton_guitar_trumpet.mid")
WAV_PATH = os.path.join(ROOT, "requiem_skeleton_guitar_trumpet.wav")

TPQ = 480
BPM = 48
BEAT_SEC = 60.0 / BPM
SR = 44100
CHORD_BEATS = 1.0


def varlen(value):
    out = [value & 0x7F]
    value >>= 7
    while value:
        out.insert(0, (value & 0x7F) | 0x80)
        value >>= 7
    return bytes(out)


def midi_note(name):
    notes = {"C": 0, "C#": 1, "Db": 1, "D": 2, "D#": 3, "Eb": 3, "E": 4, "F": 5,
             "F#": 6, "Gb": 6, "G": 7, "G#": 8, "Ab": 8, "A": 9, "A#": 10, "Bb": 10, "B": 11}
    return 12 * (int(name[-1]) + 1) + notes[name[:-1]]


def freq(note):
    return 440.0 * (2 ** ((note - 69) / 12))


def add_note(events, beat, dur, note, vel, ch):
    t = int(beat * TPQ)
    d = int((beat + dur) * TPQ)
    events.append((t, ch, "on", note, vel))
    events.append((d, ch, "off", note, 0))


def write_midi(events):
    programs = {0: 24, 1: 56}
    chunks = []
    for ch in sorted({e[1] for e in events}):
        evs = sorted((tick, kind, note, vel) for tick, c, kind, note, vel in events if c == ch)
        data = bytearray()
        name = "Guitar" if ch == 0 else "Background Trumpet"
        data += varlen(0) + bytes([0xFF, 0x03, len(name)]) + name.encode()
        data += varlen(0) + bytes([0xC0 | ch, programs[ch]])
        last = 0
        for tick, kind, note, vel in evs:
            data += varlen(max(0, tick - last))
            last = tick
            data += bytes([(0x90 if kind == "on" else 0x80) | ch, note, vel])
        data += varlen(0) + bytes([0xFF, 0x2F, 0])
        chunks.append(b"MTrk" + struct.pack(">I", len(data)) + data)
    header = b"MThd" + struct.pack(">IHHH", 6, 1, len(chunks), TPQ)
    with open(MIDI_PATH, "wb") as f:
        f.write(header + b"".join(chunks))


CHORDS = {
    "D": ["D3", "A3", "D4", "F#4"],
    "G": ["G2", "D3", "G3", "B3"],
    "C": ["C3", "G3", "C4", "E4"],
    "Am": ["A2", "E3", "A3", "C4"],
    "A": ["A2", "E3", "A3", "C#4"],
    "Bm": ["B2", "F#3", "B3", "D4"],
    "B": ["B2", "F#3", "B3", "D#4"],
    "Em": ["E3", "B3", "E4", "G4"],
    "C#dim": ["C#3", "G3", "Bb3", "E4"],
    "F#dim": ["F#2", "C3", "Eb3", "A3"],
    "F#": ["F#2", "C#3", "F#3", "A#3"],
    "F#sus4": ["F#2", "C#3", "F#3", "B3"],
    "C#sus4": ["C#3", "G#3", "C#4", "F#4"],
    "C#": ["C#3", "G#3", "C#4", "F4"],
    "F#m": ["F#2", "C#3", "F#3", "A3"],
    "Gm": ["G2", "D3", "G3", "Bb3"],
    "C#m": ["C#3", "G#3", "C#4", "E4"],
    "E": ["E3", "B3", "E4", "G#4"],
    "Bdim": ["B2", "F3", "Ab3", "D4"],
    "Fdim": ["F2", "B2", "D3", "Ab3"],
    "F": ["F2", "C3", "F3", "A3"],
    "Dm": ["D3", "A3", "D4", "F4"],
    "Abdim": ["Ab2", "D3", "F3", "B3"],
}

FORM = [
    ("Intro 1", ["D", "G", "D", "C", "G", "D", "Am", "G", "Am", "D", "A", "D", "Bm", "B", "Em", "B", "Em", "C"]),
    ("Verse 1", ["D", "G", "B", "Em", "Am", "G", "D", "G"]),
    ("Solo and Chorus", ["Em", "C#dim", "C", "F#dim", "B", "F#", "C#dim", "Em", "B", "Em",
                         "Am", "F#dim", "B", "Em", "B", "Am", "B", "Em", "F#sus4", "F#",
                         "Bm", "F#", "Bm", "C#sus4", "C#", "D", "C#", "F#m", "B", "Em",
                         "B", "Em", "D", "A", "D", "A", "D", "Bm", "F#", "Bm", "D",
                         "G", "Bm", "Bdim", "Fdim", "Bm", "F#", "Bm", "F#", "Bm", "F#",
                         "A", "F#", "Abdim", "G", "Bm", "F#", "F#sus4", "F#", "D", "Gm", "F#"]),
    ("Verse 2", ["Bm", "C#m", "F#", "D", "F#", "E", "F#", "Bm", "C#", "F#", "D", "C#",
                 "F#", "Bm", "Em", "F#", "B", "Bm", "C#", "F#", "E", "A", "D", "C#m",
                 "F#", "B", "A", "D", "A", "D", "Bm", "Em", "D", "F#", "D", "B", "C",
                 "B", "Em", "D", "Em", "D", "B", "Em", "Am", "F", "Fdim", "E", "Am",
                 "Dm", "G", "C", "Dm", "Em", "C", "G", "D", "G", "C", "D", "Em", "D",
                 "G", "Em", "D", "G", "Am", "G", "Em", "A", "Dm", "A", "Dm", "D",
                 "Em", "B", "Em", "F#", "G", "F#", "Bm", "C#dim", "F#", "G", "F#",
                 "Bm", "F#", "G", "F#", "Bm", "E", "F#", "B", "C#m", "F#", "B", "F#",
                 "Fdim", "F#", "Bm", "F#", "B"]),
]


def flatten_form():
    bars = []
    for section, chords in FORM:
        for chord in chords:
            bars.append((section, chord))
    return bars


def make_events():
    events = []
    random.seed(11)
    bars = flatten_form()
    trumpet_pool = ["D5", "F#5", "A5", "B5", "G5", "E5", "C#5", "F#5",
                    "B4", "D5", "E5", "F#5", "G5", "F#5", "D5", "B4"]

    for bar, (section, chord_name) in enumerate(bars):
        notes = [midi_note(n) for n in CHORDS[chord_name]]
        base = bar * CHORD_BEATS
        section_lift = 8 if section == "Solo and Chorus" else 0
        vel = 48 + min(24, bar // 7)

        # Fingerpicked guitar: one compact arpeggio per chord, matching the chart flow.
        add_note(events, base, 0.9, notes[0], vel + 8, 0)
        add_note(events, base + 0.5, 0.45, notes[1], vel + 4, 0)
        pattern = [2, 3, 1, 2]
        offsets = [0.12, 0.34, 0.58, 0.78]
        for off, idx in zip(offsets, pattern):
            add_note(events, base + off, 0.18, notes[idx], vel, 0)

        # Occasional brushed strum made from slightly staggered guitar notes.
        if bar % 4 == 3 or chord_name.endswith("sus4"):
            for i, n in enumerate(notes):
                add_note(events, base + 0.86 + i * 0.012, 0.12, n, vel - 8, 0)

        # Background trumpet only, slow and sparse.
        if bar > 10 and bar % 3 == 1:
            target = midi_note(trumpet_pool[(bar + section_lift) % len(trumpet_pool)])
            add_note(events, base + 0.18, 1.55, target, 38, 1)
        if section == "Solo and Chorus" and bar % 8 == 0:
            add_note(events, base + 0.62, 0.7, notes[-1] + 12, 42, 1)

    final_base = len(bars) * CHORD_BEATS
    for i, n in enumerate([midi_note("B2"), midi_note("F#3"), midi_note("B3"), midi_note("D4")]):
        add_note(events, final_base + i * 0.04, 3.0, n, 58, 0)
    add_note(events, final_base + 0.4, 2.4, midi_note("B4"), 34, 1)
    return events


def env(x, dur, attack=0.015, release=0.18):
    if x < attack:
        return x / attack
    if x > dur - release:
        return max(0.0, (dur - x) / release)
    return 1.0


def render_wav(events):
    last_tick = max(tick for tick, *_ in events)
    total = int(((last_tick / TPQ) * BEAT_SEC + 2) * SR)
    audio = [0.0] * total
    active = {}
    notes = []
    for tick, ch, kind, note, vel in sorted(events):
        if kind == "on":
            active.setdefault((ch, note), []).append((tick, vel))
        elif active.get((ch, note)):
            start, v = active[(ch, note)].pop(0)
            notes.append((start / TPQ * BEAT_SEC, tick / TPQ * BEAT_SEC, ch, note, v / 127))

    def karplus_strong(f, dur, amp):
        n = max(2, int(SR / f))
        buf = [random.uniform(-1, 1) * amp for _ in range(n)]
        out = []
        idx = 0
        samples = int(dur * SR)
        for _ in range(samples):
            current = buf[idx]
            nxt = 0.996 * 0.5 * (buf[idx] + buf[(idx + 1) % n])
            buf[idx] = nxt
            idx = (idx + 1) % n
            out.append(current)
        return out

    for start, end, ch, note, vel in notes:
        s = int(start * SR)
        e = min(total, int(end * SR))
        f = freq(note)
        dur = max(0.01, end - start)
        if ch == 0:
            pluck = karplus_strong(f, dur, 0.55)
            for j, val in enumerate(pluck[:max(0, e - s)]):
                t = j / SR
                body = 0.55 + 0.45 * math.sin(2 * math.pi * 110 * t)
                pick = random.uniform(-0.15, 0.15) * math.exp(-t * 80)
                audio[s + j] += (val * body + pick) * vel * 0.42
        else:
            for i in range(s, e):
                t = (i - s) / SR
                a = env(t, dur, 0.09, 0.42)
                vibrato = 1 + 0.006 * math.sin(2 * math.pi * 5.6 * t)
                phase = 2 * math.pi * f * vibrato * t
                brass = math.sin(phase)
                brass += 0.55 * math.sin(2 * phase)
                brass += 0.28 * math.sin(3 * phase)
                brass += 0.13 * math.sin(4 * phase)
                mute_buzz = 0.04 * math.sin(2 * math.pi * 34 * t)
                audio[i] += math.tanh(brass * 1.4 + mute_buzz) * a * vel * 0.12

    peak = max(0.001, max(abs(x) for x in audio))
    scale = 0.92 / peak
    with wave.open(WAV_PATH, "w") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        frames = bytearray()
        for x in audio:
            v = int(max(-1, min(1, x * scale)) * 32767)
            frames += struct.pack("<hh", v, v)
        wf.writeframes(frames)


def main():
    events = make_events()
    write_midi(events)
    render_wav(events)
    print(MIDI_PATH)
    print(WAV_PATH)


if __name__ == "__main__":
    main()
