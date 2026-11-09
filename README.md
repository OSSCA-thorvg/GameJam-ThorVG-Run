# ThorVG Run

**A 2D vector audio-waveform platformer with infinite-scale diving — TypeScript + React 18 + ThorVG WASM (`@thorvg/webcanvas`)**

[English](#english) · [한국어](#한국어)

---

## English

### Features
- **Powered-by-ThorVG splash**: the `Powered by ThorVG` Lottie plays once when the app is first opened, then the main menu appears.
- **Among Us crewmate as the main character**: a Lottie run cycle whose speed follows the game (faster while dashing, paused in the air). A colored aura shows the active resonance form.
- **English / Korean**: the game always starts in English. Switch with the `EN | 한국어` toggle on the main menu (not saved — every new visit starts in English).
- **Live CPU / GPU ThorVG renderer switching**: `SwCanvas` (`'sw'`, software rasterizer) or `GlCanvas` (`'gl'`, WebGL2), switchable from the menu or in game.
- **Infinite-scale diving with Acoustic Zoom**: touching a frequency node zooms 1.0x → 50.0x with origin rebasing, while a Web Audio `BiquadFilterNode` isolates the matching band.
- **Skul-style Resonance Swap**: Bass (landing shockwave), Synth (double jump & grind), Treble (blink dash).

### Supported audio files for upload
Uploaded files are decoded by your browser (`AudioContext.decodeAudioData`), so support depends on the browser. The menu shows the formats **your** browser reports as playable, and the file picker and validation use the same list.

| Format | Extensions | Chrome / Edge | Firefox | Safari |
| :--- | :--- | :---: | :---: | :---: |
| MP3 | `.mp3` | ✅ | ✅ | ✅ |
| MP4 (audio / video) | `.mp4` | ✅ | ✅ (OS codec) | ✅ |
| WAV | `.wav` | ✅ | ✅ | ✅ |
| AAC | `.m4a`, `.aac` | ✅ | ✅ (OS codec) | ✅ |
| FLAC | `.flac` | ✅ | ✅ | ✅ (recent) |
| Ogg Vorbis | `.ogg`, `.oga` | ✅ | ✅ | ⚠️ version-dependent |
| Opus | `.opus` | ✅ | ✅ | ⚠️ version-dependent |
| WebM audio | `.webm` | ✅ | ✅ | ⚠️ version-dependent |

Limits: **max 50 MB**, **min 5 seconds**. Files are decoded locally and never uploaded to a server.

### Controls
| Key | Action |
| :--- | :--- |
| `Space` / left click | Jump · Micro View phase invert (+A ↔ -A) |
| `Shift` / right click | Form skill (shockwave / dash / blink) |
| `1` `2` `3` / `Q` | Swap resonance form |
| `Esc` | Back to menu |

### Translations
All user-facing text lives in [`src/i18n/messages.ts`](src/i18n/messages.ts). `en` is the reference dictionary and `ko` is typed against it, so a missing or misspelled Korean key fails `npm run build`.

---

## 한국어

### 주요 기능
- **Powered by ThorVG 스플래시**: 앱을 처음 열 때 `Powered by ThorVG` Lottie를 한 번 재생한 뒤 메인 화면으로 이동합니다.
- **어몽어스 메인 캐릭터**: 달리기 Lottie가 게임 속도에 맞춰 재생됩니다(대시 중 빨라지고 공중에서는 멈춤). 캐릭터 뒤 오라 색으로 현재 공명 폼을 표시합니다.
- **영어 / 한국어**: 항상 영어로 시작하며, 메인 화면의 `EN | 한국어` 버튼으로 바꿀 수 있습니다(저장하지 않으므로 다시 열면 영어로 시작).
- **CPU / GPU ThorVG 렌더러 실시간 전환**: `SwCanvas`(`'sw'`) / `GlCanvas`(`'gl'`, WebGL2)를 메뉴나 게임 중에 전환합니다.
- **무한 스케일 다이빙 + 청각적 줌**, **스컬식 공명 변신**(베이스 / 신스 / 트레블).

### 업로드 가능한 오디오 형식
업로드한 파일은 브라우저가 직접 디코딩하므로 지원 형식은 브라우저마다 다릅니다. 메인 화면에 **현재 브라우저**에서 재생 가능한 형식이 표시되며, 파일 선택창과 업로드 검사도 같은 목록을 사용합니다. 형식별 지원 현황은 위 영어 섹션의 표를 참고하세요.

제한: **최대 50MB**, **최소 5초**. 파일은 브라우저 안에서만 처리되며 서버로 전송되지 않습니다.

### 번역 관리
모든 화면 문구는 [`src/i18n/messages.ts`](src/i18n/messages.ts) 한 파일에서 관리합니다. `en`이 기준이고 `ko`는 같은 구조로 타입이 강제되어, 한국어 키가 빠지면 `npm run build`가 실패합니다.

---

## Development / 개발

```bash
npm install
npm run dev      # dev server
npm run build    # type check + production bundle (dist/)
npm run preview  # preview the production build
```
