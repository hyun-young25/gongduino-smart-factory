# 공두이노 스마트 팩토리

브라우저에서 실행하는 Three.js 기반 3D 공장과 색상분류 컨베이어 시뮬레이터입니다.

**[공장 실행하기 · GitHub Pages](https://hyun-young25.github.io/gongduino-smart-factory/)**

[기존 배포 링크](https://gongduino-color-conveyor.hyunyoung2026.chatgpt.site)

첫 화면은 공장 전체입니다. **색상분류 컨베이어 → 열기**를 누르면 상세 시뮬레이터로 들어가며, **공장 전체로**를 누르면 메인으로 돌아옵니다.

## 기능

- 파란 랙, 노란 안전펜스, 셀별 투입 컨베이어와 메인 컨베이어
- 로봇 4대가 랙의 실제 박스 24개를 꺼내 컨베이어에 투입
- 출고 로봇 4대가 박스를 집어 서울·대전·부산 도크로 운반
- 제공된 DOBOT MG400 CAD를 관절별로 분리한 로봇팔 8대
- J1~J4 4축과 평행 링크 연동, 집게 개폐, 이동·집기·놓기와 박스 추적
- 재생/일시정지, 속도 변경, 랙 재입고, 통계 초기화, 카메라 보기
- 별도 색상분류 시뮬레이터

무게 선별·바코드 검수·포장 셀의 상세 화면은 준비 중입니다. 공장과 색상분류 상세 화면은 각각 독립 시뮬레이션이며 이동 시 진행 상태를 공유하지 않습니다.

## 로컬 실행

Node.js 22 이상에서 실행합니다. 화면을 실행하는 데 패키지 설치나 빌드는 필요 없습니다.

```sh
git clone https://github.com/hyun-young25/gongduino-smart-factory.git
cd gongduino-smart-factory
npm start
```

표시되는 `http://127.0.0.1:4173`에 접속합니다. GLB 로딩을 위해 HTML을 더블클릭하는 대신 HTTP 서버로 실행하세요.

마우스 왼쪽 드래그는 회전, **가운데 휠을 누른 채 드래그는 화면 이동**, 휠 스크롤은 확대·축소입니다.

## 구성

| 경로 | 내용 |
| --- | --- |
| `dist/index.html` | 공장 전체 메인 화면과 3D 장면 |
| `dist/conveyor.html` | 클릭해 들어가는 색상분류 상세 화면 |
| `dist/factory.html` | 기존 공장 링크를 메인으로 연결 |
| `dist/factory-layout.js` | 랙, 안전펜스, 작업 셀 배치 |
| `dist/factory-arm.js` | 관절형 로봇팔과 역기구학 |
| `dist/factory-supply.js` | 랙 재고와 박스 투입 동작 |
| `dist/factory-logistics.js` | 컨베이어, 출고 로봇, 도크 흐름 |
| `dist/models/` | 실행에 필요한 GLB 모델과 출처 |
| `dist/vendor/` | Three.js, QR 생성기, 라이선스 |
| `scripts/` | 로컬 서버, 검증, 모델 최적화·리깅 도구 |

## 검증 및 모델 재생성

```sh
npm ci
npm test
```

검증은 페이지 연결·자산 경로·문법과 실제 GLB 관절 구조를 확인합니다. 24개 박스의 랙 집기부터 출고까지 모든 인계, 중복 방지, 간격, 로봇과 랙·펜스 사이 여유, 집게 추적, 초기화 및 재입고를 검사합니다.

최적화된 모델은 이미 포함되어 있습니다. 원본으로 재생성하려면:

```sh
npm run models:download
npm run models:build
```

다운로드 도구는 원본의 SHA-256을 확인합니다. 원본은 `model-sources/`에 저장되며 Git에서 제외됩니다.

## DOBOT MG400 재생성

`dist/models/mg400-rigged.glb`는 제공된 STL의 실제 표면을 9개 부품으로 나눈 모델입니다. 제조사 ROS의 부품별 표면을 분리 기준으로 사용하고 회전축과 평행 링크를 재구성했습니다. 원본 CAD 파일 자체는 저장소에 포함하지 않았습니다. 원본 해시는 `dist/models/MG400-PROVENANCE.json`에 있습니다.

```sh
python -m pip install numpy scipy trimesh fast-simplification
python scripts/segment-mg400.py "/path/to/DOBOT MG400.stl" model-sources/mg400
node scripts/rig-mg400.mjs model-sources/mg400/parts.json
```

공장에서는 MG400을 균일하게 3배 확대해 이동 플랫폼에 장착하고 박스용 집게를 추가했습니다. 박스 인계 중 관절 범위, 집게 위치, 평행 링크의 연결 및 손목 수평 유지도 검사합니다. 재구성한 시각화 모델이며 실제 로봇 제어·충돌 검증용 모델은 아닙니다.

## 정적 호스팅

GitHub Pages는 `.github/workflows/pages.yml`로 자동 배포됩니다. `main` 브랜치의 `dist/`, 페이지 검증 스크립트 또는 배포 설정을 수정하면 검증 후 게시됩니다. Actions의 **Deploy factory to GitHub Pages → Run workflow**에서 수동 배포할 수도 있습니다.

`dist/`의 내용 전체를 정적 호스팅에 게시하면 됩니다. 진입 파일은 `index.html`입니다. 상대 경로를 사용하므로 하위 경로에도 게시할 수 있습니다. JavaScript와 모델은 저장소에 포함되어 있으며, Google Fonts에 연결할 수 없으면 시스템 글꼴을 사용합니다.

## 외부 자산

3D 모델의 출처와 라이선스 안내는 [ATTRIBUTION.txt](dist/models/ATTRIBUTION.txt)를 확인하세요. MG400은 제공된 제조사 CAD를 바탕으로 했으며, 범용 이동 플랫폼·트럭·컨베이어의 CC0 표기와 구분됩니다. Three.js r128과 예제 도구는 MIT, QR Code Generator 1.4.4도 MIT입니다. 해당 저작권·라이선스 고지를 `dist/vendor/`에 포함했습니다. 이 저장소의 공개 여부와 별개로, 프로젝트 자체 코드의 재사용 라이선스는 아직 지정하지 않았습니다.
