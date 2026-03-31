# Biome Lint & Format 설정

## 목표

tk-cli에 Biome를 도입하여 lint + format을 단일 도구로 해결한다.

## 설정

### biome.json

- **Linter:** recommended 규칙 기본 활성화
  - `noProcessExit`: off (CLI 특성상 process.exit 다수 사용)
  - `noUnusedLocals` / `noUnusedParameters` 등 tsconfig와 중복되는 규칙은 Biome 기본에 위임
- **Formatter:**
  - indent: space 2
  - line width: 120
  - quote style: double
  - trailing comma: all
  - semicolons: always
- **무시 대상:** `dist/`, `node_modules/`, `.idea/`

### package.json 스크립트

| 스크립트 | 명령어 | 용도 |
|---------|--------|------|
| `lint` | `biome lint .` | 린트만 실행 |
| `format` | `biome format --write .` | 포맷 자동 수정 |
| `check` | `biome check .` | lint + format 검사 (CI용) |

## 구현 순서

1. `bun add -d @biomejs/biome`
2. `biome.json` 생성
3. `package.json` 스크립트 추가
4. `bun run format` 실행하여 기존 코드 포맷 적용
5. `bun run check` 실행하여 lint 이슈 확인 및 수정
