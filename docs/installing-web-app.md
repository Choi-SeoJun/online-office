# 온라인 회사 설치형 웹앱

기존 주소 https://choi-seojun.github.io/online-office/ 를 그대로 사용합니다.

- 시작 화면과 게임 안 메뉴에서 **앱 설치**를 선택합니다.
- Android의 Chrome에서 설치 이벤트가 준비되면 기본 설치창을 엽니다. 준비 전·취소 후에는 Chrome 메뉴의 **홈 화면에 추가 / 앱 설치** 방법을 안내합니다.
- iPhone/iPad에서는 **홈 화면에 추가** 버튼으로 Safari의 공유 메뉴 안내를 엽니다. **웹 앱으로 열기**가 보이면 켜도록 안내합니다.
- 이미 standalone으로 실행했거나 현재 페이지에서 설치 완료 이벤트를 받으면 버튼을 숨깁니다. 영구 설치 플래그는 저장하지 않습니다. 사용자가 나중에 삭제해도 재설치가 가능해야 하기 때문입니다.
- 멀티·날씨 등을 포함한 기존 온라인 게임입니다. 오프라인 실행을 제공하지 않습니다.

## 배포 설정

`public/manifest.webmanifest`의 상대 start_url/scope/icons를 사용하므로 GitHub Pages의 `/online-office/`와 Sites의 `/`에서 같은 파일이 동작합니다. `id`는 생략하여 브라우저가 각 배포의 고정 start_url을 ID로 쓰게 합니다. 초대 방 코드·개인 정보는 설치 주소에 포함하지 않습니다.

Pages HTML과 Sites 루트 metadata 모두 manifest와 Apple touch icon을 연결합니다. 아이콘은 기존 `public/favicon.svg`의 건물 마크에서 만든 PNG이며, maskable/Apple 아이콘은 모서리까지 불투명한 배경입니다.

현재 Chrome 설치 조건에 서비스 워커는 필수가 아닙니다. 이번 변경은 서비스 워커나 추가 캐시를 두지 않으므로 API·개인 건의함·배포 갱신 경로를 가로채지 않습니다. 설치 이벤트는 사용자 방문 시간·상호작용·브라우저 환경에 따라 늦게 오거나 없을 수 있어 수동 안내를 항상 제공합니다.

설치가 기기 간 저장 동기화를 추가하지는 않습니다. 기존 브라우저 저장 방식은 유지되며, 특히 iOS에서 Safari와 설치된 웹앱의 저장소가 분리될 수 있으므로 기존 개인 데이터가 복사된다고 안내하지 않습니다.

참고: [Chrome 설치 조건](https://web.dev/articles/install-criteria), [MDN start_url](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Manifest/Reference/start_url), [Apple 홈 화면 추가](https://support.apple.com/guide/iphone/open-as-web-app-iphea86e5236/ios).

## 검증

`node --test game/app-install.test.ts game/app-manifest.test.ts`는 플랫폼 판별, 일회성 설치 이벤트, 취소·오류·중복 클릭, 설치/standalone 상태, 정리, 배포별 URL과 PNG 크기를 검사합니다.

모바일 폭 390px에서 안내와 메뉴를 확인했습니다. 배포에 포함되지 않는 로컬 검사 페이지로 iOS/Android 사용자 에이전트와 설치 이벤트를 주입하여 안내, 모드 전환 후 이벤트 유지, 취소, 설치 완료/standalone 숨김을 확인했습니다. 이는 실제 Android WebAPK 설치나 실제 iPhone 홈 화면 추가를 수행한 검증은 아닙니다.
