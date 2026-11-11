# ThorVG Run

**A 2D vector hybrid rhythm-runner platformer with infinite-scale diving — TypeScript + React 18 + ThorVG WASM (`@thorvg/webcanvas`)**

[English](#english) · [한국어](#한국어)

---

## English

### Features
- **Zero-offset 1:1 beat-synced course (`TrackAnalyzer`)**: before each run begins, a full-track loading pass scans the decoded `AudioBuffer` at 20ms hop resolution (3-band IIR envelope, spectral-flux onset peak picking, and `Calm` / `Groove` / `Drop` section classification) so every obstacle, platform, gimmick, and rhythm note lands at the exact `playerWorldX = audioSec * worldPxPerSec` beat timestamp.
- **Multi-tier Hybrid Rhythm-Runner course (Cookie Run + Muse Dash style)**:
  - Sprint across crisp stepped neon decks, leap over **abyss chasm gaps**, and climb onto **one-way 2nd-floor sky platforms** (`SkyPlatform`) for high-value rhythm routes.
  - **3 Track Gimmick Objects**:
    1. **Beat Jump Pads (`JumpPad`)**: spring-loaded pads on strong bass downbeats that launch the runner onto 2F sky decks or across wide chasms.
    2. **Airborne Dash Rings (`DashRing`)**: electric mid-air rings that trigger a zero-gravity high-speed horizontal boost.
    3. **Hold Note Rails (`HoldRail`)**: glowing energy beams during sustained sections — hold `Space` / Left Click to grind for continuous combo ticks and sparks.
- **Real-time rhythm timing judgments & shrinking beat rings**:
  - Approaching beat notes and dash rings display a **shrinking outer timing ring** that converges onto the target on the exact beat.
  - Every action awards **`PERFECT!` / `GREAT!` / `GOOD` / `MISS`** timing feedback, camera beat zoom punch, live HUD `Accuracy %`, and a final **`S / A / B / C` Rank** breakdown on the Result Modal.
- **Difficulty & rhythm speed modes (`Easy` / `Normal` / `Hard`)**: selectable right from Section 3 of the Start Screen (`450 / 550 / 660 px/s` scroll speed, obstacle/gap density scaling, and tailored timing windows).
- **Powered-by-ThorVG splash (60% viewport fit, unclipped)**: plays once on initial launch at a clean 60% viewport scale with expanded runtime precomp/matte bounds so lightning bolts render without horizontal clipping.
- **Among Us crewmate as the main character**: a Lottie run cycle whose speed follows your sprint/grind pace, backed by a form-colored resonance aura.
- **English / Korean**: always starts in English; switch anytime via the `EN | 한국어` toggle on the Start Screen.
- **Live CPU / GPU ThorVG renderer switching**: `SwCanvas` (`'sw'`, software rasterizer) or `GlCanvas` (`'gl'`, WebGL2), switchable from the menu or mid-run.
- **Infinite-scale diving with Acoustic Zoom & Skul-style Resonance Swap**: dive 1.0x → 50.0x into frequency portals with origin rebasing, or swap freely between Bass (landing shockwave), Synth (double jump), and Treble (invulnerable blink dash).

### Supported audio files for upload
Uploaded files are decoded by your browser (`AudioContext.decodeAudioData`), so support depends on the browser. Default track (`Mens Tear - AK47`) comes pre-loaded, and you can add more tracks anytime via click or drag-and-drop.

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
| `Space` / `W` / `Up` / Left Click (Hold) | On-beat jump · Hold rail grind · Micro View phase invert (+A ↔ -A) |
| `S` / `Down Arrow` (Hold) | Fast drop onto ground beat targets |
| `Shift` / Right Click | Form skill / Beat dash / Air dash ring trigger |
| `1` `2` `3` / `Q` | Swap Bass / Synth / Treble resonance form |
| `Esc` | Back to menu |

### Translations
All user-facing text lives in [`src/i18n/messages.ts`](src/i18n/messages.ts). `en` is the reference dictionary and `ko` is typed against it, so a missing or misspelled Korean key fails `npm run build`.

---

## 한국어

### 주요 기능
- **오차 0ms 1:1 정밀 비트 싱크 코스 (`TrackAnalyzer`)**: 게임 시작 전 전체 `AudioBuffer`를 20ms 해상도로 정밀 분석(3대역 에너지·스펙트럴 플럭스 비트 온셋 피크 검출·`Calm`/`Groove`/`Drop` 구간 분류)하여, 모든 장애물·발판·기믹·리듬 노트가 캐릭터 히트 라인(`playerWorldX = audioSec * worldPxPerSec`)과 정확히 일치하도록 배치합니다.
- **복층 하이브리드 리듬 러너 맵 (쿠키런 + 뮤즈대시 스타일)**:
  - 시원하게 뻗은 평지 네온 질주 트랙 위를 달리며 **크레바스 낙하 틈새(Gap)**를 뛰어넘고, **단방향 2층 공중 발판(`SkyPlatform`)**을 오르내리며 입체적인 루트를 공략합니다.
  - **3종 트랙 기믹 오브젝트**:
    1. **비트 점프 패드 (`JumpPad`)**: 강한 드럼 정박 지점에 배치되어 2층 발판이나 넓은 크레바스 너머로 슈퍼 도약시킵니다.
    2. **공중 대시 링 (`DashRing`)**: 공중 고비트에 맞춰 통과/입력하면 무중력 직선 초고속 부스트가 발동합니다.
    3. **롱노트 홀드 레일 (`HoldRail`)**: 지속음 구간에서 `Space` / 좌클릭을 홀드해 레일을 타면 연속 콤보 틱과 스파크 보너스를 획득합니다.
- **실시간 리듬 판정 & 수축 타이밍 링**:
  - 정박 타겟 노트와 대시 링 주위에 비트에 맞춰 조여드는 **수축 타이밍 링**이 표시되어 정확한 입력 타이밍을 직관적으로 안내합니다.
  - 매 액션마다 **`PERFECT!` / `GREAT!` / `GOOD` / `MISS`** 실시간 판정 팝업과 카메라 비트 줌 펀치, 실시간 `정확도(%)`, 완주 결과 모달의 최종 **`S / A / B / C` 랭크**가 제공됩니다.
- **난이도 및 주행 속도 선택 (`Easy` / `Normal` / `Hard`)**: 시작 화면 3번 영역에서 난이도별 스크롤 속도(`450 / 550 / 660 px/s`), 패턴 밀도, 판정 범위를 직접 선택할 수 있습니다.
- **Powered by ThorVG 스플래시 (화면 60% 스케일 & 잘림 완벽 제거)**: 최초 실행 시 화면 대비 60% 크기로 깔끔하게 중앙 재생되며, 런타임 프리컴프/매트 영역 확장으로 상하 번개 이펙트가 수평으로 잘리지 않고 온전히 출력됩니다.
- **어몽어스 메인 캐릭터**: 질주 및 레일 주행 속도에 연동되는 Lottie 달리기 애니메이션과 공명 폼 오라가 적용됩니다.
- **영어 / 한국어**: 항상 영어로 시작하며 메인 메뉴의 `EN | 한국어` 버튼으로 즉시 전환할 수 있습니다.
- **CPU / GPU ThorVG 렌더러 실시간 전환 (`SwCanvas` ↔ `GlCanvas`)**, **무한 스케일 다이빙 + 청각적 줌**, **스컬식 3종 공명 변신**(베이스 / 신스 / 트레블).

### 업로드 가능한 오디오 형식
기본 음원(`맨스티어_AK47`)이 기본 탑재되어 있으며, `.mp3`, `.mp4` 등 원하는 음원 파일을 클릭 또는 드래그 앤 드롭으로 추가해 즐길 수 있습니다. 지원 형식 상세 표는 위 영어 섹션을 참고하세요. (최대 **50MB**, 최소 **5초**, 브라우저 로컬 디코딩 전용)

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
