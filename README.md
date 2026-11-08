# ThorVG Run

**TypeScript + React 18 + ThorVG WASM (`@thorvg/webcanvas`) 기반 2D 벡터 오디오 파형 무한 스케일 액션 플랫포머**

## 1. 주요 기능 (Core Features)
- **실시간 CPU / GPU ThorVG 렌더러 백엔드 선택**:
  - **CPU Rendering (`ThorVG SwCanvas`)**: WASM 소프트웨어 벡터 래스터라이저 백엔드 (`'sw'`)
  - **GPU Rendering (`ThorVG GlCanvas`)**: WebGL2 하드웨어 셰이더 가속 백엔드 (`'gl'`)
  - React `<canvas key={rendererMode} />` 격리 및 `TVG.term()` 재초기화를 통해 컨텍스트 충돌 없이 즉시 전환 가능
- **시청각 동기화 무한 스케일 다이빙 (Audio-Visual Infinite Zoom & Origin Rebasing)**:
  - 주파수 다이빙 노드 접촉 시 $1.0\times \rightarrow 50.0\times$ 줌인 및 부동소수점 떨림(Jitter) 방지를 위한 **Origin Rebasing**($1.0\times$ 좌표계 초기화)
  - Web Audio API `BiquadFilterNode` 연동 **청각적 줌(Acoustic Zoom)** (Low-pass / Band-pass / High-pass 대역 격리)
- **Skul식 주파수 공명 변신 (Resonance Swap)**:
  - **Bass Form (저음, 20~250Hz)**: 육각형 중장갑 폴리곤 + **착지/지상 충격파 (Shockwave)** 비트 트랩 파괴
  - **Synth Form (중음, 250Hz~4kHz)**: 유선형 다이아몬드 폴리곤 + **공중 2단 점프 & 베지어 경사면 그라인드 가속**
  - **Treble Form (고음, 4kHz~20kHz)**: 날카로운 삼각 화살표 폴리곤 + **중력 무시 무적 관통 블링크 대시 (Blink Dash)**
- **무설치 샘플 트랙 & 로컬 음원(UGC) 즉시 플레이**:
  - 내장 멀티밴드 합성 트랙 2종(`Cyber Pulse 128 BPM`, `Subatomic Rush 140 BPM`) 및 로컬 `.mp3 / .ogg / .wav` 파일 드래그 앤 드롭 지원

## 2. 로컬 실행 및 빌드 방법

```bash
npm install
npm run dev      # 로컬 개발 서버 실행
npm run build    # TypeScript 타입 체크 및 프로덕션 정적 번들(dist/) 생성
npm run preview  # 프로덕션 빌드 로컬 프리뷰
```
