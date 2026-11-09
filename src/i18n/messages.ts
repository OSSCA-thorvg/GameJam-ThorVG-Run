/**
 * Single source of truth for every user-facing string in ThorVG Run.
 *
 * `en` is the reference dictionary. `ko` is typed as `Messages` (= typeof en),
 * so a missing, extra, or misspelled key in `ko` fails `tsc` at build time.
 *
 * Placeholders use `{name}` and are filled by `formatMessage()`.
 */

export type Lang = 'en' | 'ko';

export const DEFAULT_LANG: Lang = 'en';

/** Language names are shown in their own language, so they live outside the dictionaries. */
export const LANGUAGE_LABELS: Record<Lang, string> = {
  en: 'EN',
  ko: '한국어',
};

export const en = {
  app: {
    title: 'ThorVG Run — 2D Vector Audio Waveform Platformer',
  },
  menu: {
    versionBadge: 'ThorVG WASM v1.1.3 · Web Lightweight v3.1',
    subtitle: 'A 2D vector audio-waveform platformer with infinite-scale diving',
    github: 'GitHub Repository ↗',
    language: 'Language',
    trackSection: '1. Select Track',
    builtInTrack: 'Default Track: {title}',
    customTrack: 'Custom Track: {title}',
    trackMeta: '{artist} · {seconds}s',
    selected: 'SELECTED',
    rendererSection: '2. Select ThorVG Renderer Backend',
    rendererCpuTitle: '🖥️ CPU Rendering (ThorVG SwCanvas - Software Rasterizer)',
    rendererCpuDesc: 'ThorVG rasterizes vectors in software inside WASM, then presents the pixels to a 2D canvas',
    rendererGpuTitle: '🚀 GPU Rendering (ThorVG GlCanvas - WebGL2 Accelerated)',
    rendererGpuDesc: 'ThorVG draws vectors through the WebGL2 shader pipeline for hardware acceleration',
    formSection: '3. Resonance Form Preview (Skul-Style Resonance Swap)',
    start: '▶ START RUN',
    initializing: '⏳ Initializing ThorVG WASM...',
    controls: {
      jumpKey: 'Space / Left Click',
      jumpDesc: 'Jump & Micro phase invert (+A↔-A)',
      skillKey: 'Shift / Right Click',
      skillDesc: 'Form skill (Shockwave / Dash / Blink)',
      swapKey: '1·2·3 / Q',
      swapDesc: 'Instant resonance form swap',
    },
  },
  upload: {
    dropzone: '➕ Add more music from your PC (click or drag & drop .mp3 / .mp4 files)',
    addMoreGuide: 'Default track (Mens Tear - AK47) is pre-loaded. Upload additional tracks anytime to add them to the list above.',
    supported: 'Supported in this browser: {list}',
    noneSupported: 'This browser did not report any supported audio formats.',
    limits: 'Max {maxMb} MB · Min {minSeconds} seconds',
    analyzing: 'Analyzing: {name}...',
    loaded: 'Loaded: {name}',
    firstOnly: 'Only the first file was loaded.',
    errors: {
      unsupported: 'Unsupported format. Supported in this browser: {list}',
      decode_failed: 'Could not decode this file. It may be corrupted or use an unsupported codec.',
      too_short: 'Track is too short (minimum {minSeconds} seconds).',
      too_large: 'File is too large (max {maxMb} MB).',
    },
  },
  tracks: {
    'mens-tear-ak47': 'Mens Tear - AK47',
    defaultArtist: 'Mens Tear · Default Track',
    customArtist: 'Local Audio',
  },
  forms: {
    bass: {
      name: 'BASS FORM',
      short: 'BASS',
      band: '20Hz ~ 250Hz (Low)',
      skillName: 'Landing Shockwave',
      skillDesc: 'Slam down (Shift in the air) or press Shift on the ground to shatter traps ahead',
    },
    synth: {
      name: 'SYNTH FORM',
      short: 'SYNTH',
      band: '250Hz ~ 4kHz (Mid)',
      skillName: 'Double Jump & Grind',
      skillDesc: 'Jump twice in the air and gain a speed bonus while grinding down Bezier slopes',
    },
    treble: {
      name: 'TREBLE FORM',
      short: 'TREBLE',
      band: '4kHz ~ 20kHz (High)',
      skillName: 'Blink Dash',
      skillDesc: 'Ignore gravity and dash straight through obstacles while invulnerable',
    },
  },
  filter: {
    macro: 'FULL SPECTRUM (Macro)',
    bass: 'LOW-PASS (20~250Hz isolated)',
    synth: 'BAND-PASS (250Hz~4kHz isolated)',
    treble: 'HIGH-PASS (4kHz~20kHz isolated)',
  },
  phases: {
    MACRO: 'MACRO',
    ZOOM_IN: 'ZOOM IN',
    MICRO: 'MICRO',
    ZOOM_OUT: 'ZOOM OUT',
  },
  hud: {
    modeCpu: 'MODE: CPU [SwCanvas]',
    modeGpu: 'MODE: GPU [GlCanvas]',
    phase: 'PHASE',
    audioFilter: 'AUDIO FILTER',
    score: 'SCORE',
    combo: 'COMBO',
    toGpu: '⚡ Switch to GPU (GlCanvas)',
    toCpu: '⚡ Switch to CPU (SwCanvas)',
    menuReturn: '[ Back to Menu (Change Renderer) ]',
    resonance: 'RESONANCE {value}%',
  },
  banner: {
    ready: 'SYNTH FORM READY — JUMP [SPACE] / DASH [SHIFT]',
    manualSwap: '🔄 RESONANCE SWAP: {form} ({skill})',
    blinkDash: '⚡ TREBLE BLINK DASH — PIERCE ACTIVE',
    trapHit: '⚠️ BEAT TRAP IMPACT — COMBO RESET',
    shockwave: '💥 BASS SHOCKWAVE! {count} TRAPS SHATTERED',
    shockwaveNoHit: '💥 BASS SHOCKWAVE! IMPACT',
    zoomIn: '🔍 ACOUSTIC ZOOM IN: {band}',
    microEnter: '⚡ MICRO VIEW [64.0x REBASED] — PRESS [SPACE] TO PHASE INVERT (+A ↔ -A)',
    resonanceSwap: '🔥 RESONANCE SWAP: {form} ACTIVATED!',
  },
  result: {
    badge: 'TRACK COMPLETE · RESONANCE SYNCHRONIZED',
    renderedVia: 'Rendered via',
    cpuEngine: 'ThorVG SwCanvas (CPU Rasterizer)',
    gpuEngine: 'ThorVG GlCanvas (WebGL2 GPU)',
    finalScore: 'FINAL SCORE',
    maxCombo: 'MAX COMBO',
    dives: 'INFINITE DIVES',
    divesValue: '{count}',
    traps: 'TRAPS SHATTERED',
    trapsValue: '{count}',
    replay: '▶ Run Again with Current Renderer',
    compareGpu: '🔄 Compare in GPU (GlCanvas) Mode',
    compareCpu: '🔄 Compare in CPU (SwCanvas) Mode',
    backToMenu: '⚙️ Back to Main Menu',
  },
};

export type Messages = typeof en;

export const ko: Messages = {
  app: {
    title: 'ThorVG Run — 2D 벡터 오디오 파형 플랫포머',
  },
  menu: {
    versionBadge: 'ThorVG WASM v1.1.3 · Web Lightweight v3.1',
    subtitle: '2D 벡터 오디오 파형 무한 스케일 액션 플랫포머',
    github: 'GitHub 저장소 ↗',
    language: '언어',
    trackSection: '1. 음원 선택',
    builtInTrack: '기본 음원: {title}',
    customTrack: '추가 음원: {title}',
    trackMeta: '{artist} · {seconds}초',
    selected: '선택됨',
    rendererSection: '2. ThorVG 렌더러 엔진 선택',
    rendererCpuTitle: '🖥️ CPU 렌더링 (ThorVG SwCanvas - 소프트웨어 래스터라이저)',
    rendererCpuDesc: 'WASM 내부에서 소프트웨어로 벡터를 래스터화한 뒤 2D 캔버스에 픽셀을 출력합니다',
    rendererGpuTitle: '🚀 GPU 렌더링 (ThorVG GlCanvas - WebGL2 가속)',
    rendererGpuDesc: 'WebGL2 셰이더 파이프라인으로 벡터를 그려 하드웨어 가속을 사용합니다',
    formSection: '3. 주파수 공명 폼 프리뷰 (스컬식 공명 변신)',
    start: '▶ 게임 시작',
    initializing: '⏳ ThorVG WASM 초기화 중...',
    controls: {
      jumpKey: 'Space / 좌클릭',
      jumpDesc: '점프 & Micro 위상 반전 (+A↔-A)',
      skillKey: 'Shift / 우클릭',
      skillDesc: '폼 고유 액션 (충격파 / 대시 / 블링크)',
      swapKey: '1·2·3 / Q',
      swapDesc: '주파수 공명 폼 즉시 교체',
    },
  },
  upload: {
    dropzone: '➕ 추가 음원 업로드 (클릭하거나 .mp3 / .mp4 등 음원 파일을 드래그하여 추가)',
    addMoreGuide: '기본 음원(맨스티어_AK47)이 기본 세팅되어 있습니다. 원하는 곡을 추가로 업로드하면 위 목록에 바로 등록됩니다.',
    supported: '이 브라우저 지원 형식: {list}',
    noneSupported: '이 브라우저에서 지원하는 오디오 형식을 찾지 못했습니다.',
    limits: '최대 {maxMb}MB · 최소 {minSeconds}초',
    analyzing: '분석 중: {name}...',
    loaded: '불러오기 완료: {name}',
    firstOnly: '첫 번째 파일만 불러왔습니다.',
    errors: {
      unsupported: '지원하지 않는 형식입니다. 이 브라우저 지원 형식: {list}',
      decode_failed: '파일을 디코딩할 수 없습니다. 손상되었거나 지원하지 않는 코덱일 수 있습니다.',
      too_short: '트랙이 너무 짧습니다 (최소 {minSeconds}초).',
      too_large: '파일이 너무 큽니다 (최대 {maxMb}MB).',
    },
  },
  tracks: {
    'mens-tear-ak47': '맨스티어_AK47',
    defaultArtist: '맨스티어 · 기본 제공 음원',
    customArtist: '내 PC 추가 음원',
  },
  forms: {
    bass: {
      name: '베이스 폼',
      short: '베이스',
      band: '20Hz ~ 250Hz (저음)',
      skillName: '착지 충격파',
      skillDesc: '공중에서 Shift로 급강하하거나 지상에서 Shift를 눌러 전방의 비트 트랩을 파괴',
    },
    synth: {
      name: '신스 폼',
      short: '신스',
      band: '250Hz ~ 4kHz (중음)',
      skillName: '더블 점프 & 그라인드',
      skillDesc: '공중 2단 점프 가능, 베지어 내리막 주행 시 가속 보너스',
    },
    treble: {
      name: '트레블 폼',
      short: '트레블',
      band: '4kHz ~ 20kHz (고음)',
      skillName: '블링크 대시',
      skillDesc: '중력을 무시하고 무적 상태로 장애물을 직선 관통',
    },
  },
  filter: {
    macro: '전체 대역 (Macro)',
    bass: '로우패스 (20~250Hz 격리)',
    synth: '밴드패스 (250Hz~4kHz 격리)',
    treble: '하이패스 (4kHz~20kHz 격리)',
  },
  phases: {
    MACRO: '마크로',
    ZOOM_IN: '줌 인',
    MICRO: '마이크로',
    ZOOM_OUT: '줌 아웃',
  },
  hud: {
    modeCpu: '모드: CPU [SwCanvas]',
    modeGpu: '모드: GPU [GlCanvas]',
    phase: '페이즈',
    audioFilter: '오디오 필터',
    score: '점수',
    combo: '콤보',
    toGpu: '⚡ GPU(GlCanvas)로 전환',
    toCpu: '⚡ CPU(SwCanvas)로 전환',
    menuReturn: '[ 메뉴로 돌아가기 (렌더러 변경) ]',
    resonance: '공명 {value}%',
  },
  banner: {
    ready: '신스 폼 준비 완료 — 점프 [SPACE] / 대시 [SHIFT]',
    manualSwap: '🔄 공명 변신: {form} ({skill})',
    blinkDash: '⚡ 트레블 블링크 대시 — 관통 활성화',
    trapHit: '⚠️ 비트 트랩 충돌 — 콤보 초기화',
    shockwave: '💥 베이스 충격파! 트랩 {count}개 파괴',
    shockwaveNoHit: '💥 베이스 충격파!',
    zoomIn: '🔍 청각적 줌 인: {band}',
    microEnter: '⚡ 마이크로 뷰 [64.0x 리베이스] — [SPACE]로 위상 반전 (+A ↔ -A)',
    resonanceSwap: '🔥 공명 변신: {form} 활성화!',
  },
  result: {
    badge: '트랙 완주 · 공명 동기화 완료',
    renderedVia: '렌더링 엔진',
    cpuEngine: 'ThorVG SwCanvas (CPU 래스터라이저)',
    gpuEngine: 'ThorVG GlCanvas (WebGL2 GPU)',
    finalScore: '최종 점수',
    maxCombo: '최대 콤보',
    dives: '무한 다이빙',
    divesValue: '{count}회',
    traps: '파괴한 트랩',
    trapsValue: '{count}개',
    replay: '▶ 현재 렌더러로 다시 달리기',
    compareGpu: '🔄 GPU (GlCanvas) 모드로 비교 플레이',
    compareCpu: '🔄 CPU (SwCanvas) 모드로 비교 플레이',
    backToMenu: '⚙️ 메인 메뉴로 돌아가기',
  },
};

export const MESSAGES: Record<Lang, Messages> = { en, ko };

export type BannerKey = keyof Messages['banner'];

export type MessageParams = Record<string, string | number>;

/** Replaces `{name}` placeholders. Unknown placeholders are left as-is so missing params are visible. */
export function formatMessage(template: string, params: MessageParams = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match
  );
}

