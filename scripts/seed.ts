#!/usr/bin/env bun
/**
 * 샘플 데이터 시드 스크립트
 * 사용: bun run scripts/seed.ts [--reset]
 *
 * 3개 프로젝트, 다양한 stage/step/status/priority 조합
 */

import { initDb } from "../src/db/schema";

const reset = process.argv.includes("--reset");

if (reset) {
  const { getDbPath } = await import("../src/db/schema");
  const { unlinkSync } = await import("node:fs");
  try {
    unlinkSync(getDbPath());
    console.log("DB 삭제 완료");
  } catch {
    // 파일 없으면 무시
  }
}

const db = initDb();

// ─── 프로젝트 3개 ─────────────────────────────────────────
const projects = [
  { name: "my-app", key: "APP", path: "/Users/jerry/Projects/my-app" },
  { name: "blog", key: "BLOG", path: "/Users/jerry/Projects/blog" },
  { name: "tk-cli", key: "TK", path: "/Users/jerry/Projects/tk-cli" },
];

for (const p of projects) {
  db.query("INSERT OR IGNORE INTO projects (name, key, path) VALUES (?, ?, ?)").run(p.name, p.key, p.path);
}

// ─── 티켓 데이터 ──────────────────────────────────────────
interface Ticket {
  id: string;
  project: string;
  title: string;
  priority: number;
  tags: string;
  stage: string | null;
  step: string | null;
}

const tickets: Ticket[] = [
  // === APP: SDLC 워크플로우 (stage 활용) ===
  { id: "APP-0001", project: "my-app", title: "검색 API 자동완성", priority: 1, tags: '["backend","search"]', stage: "spec", step: "reviewing" },
  { id: "APP-0002", project: "my-app", title: "로그인 버그 수정", priority: 0, tags: '["bug","auth"]', stage: "dev", step: "coding" },
  { id: "APP-0003", project: "my-app", title: "대시보드 UI 리뉴얼", priority: 2, tags: '["frontend"]', stage: "design", step: "wireframing" },
  { id: "APP-0004", project: "my-app", title: "배포 파이프라인 구축", priority: 1, tags: '["infra","ci"]', stage: "research", step: null },
  { id: "APP-0005", project: "my-app", title: "사용자 프로필 API", priority: 2, tags: '["backend"]', stage: "dev", step: "testing" },
  { id: "APP-0006", project: "my-app", title: "알림 시스템 설계", priority: 3, tags: '["backend"]', stage: "prd", step: "drafting" },
  { id: "APP-0007", project: "my-app", title: "DB 마이그레이션 v2", priority: 1, tags: '["db"]', stage: "verify", step: null },
  { id: "APP-0008", project: "my-app", title: "에러 로깅 개선", priority: 2, tags: '["observability"]', stage: "dev", step: "coding" },

  // === BLOG: 글쓰기 워크플로우 (stage 활용) ===
  { id: "BLOG-0001", project: "blog", title: "AI 코드리뷰 포스팅", priority: 1, tags: '["ai","writing"]', stage: "editing", step: "proofreading" },
  { id: "BLOG-0002", project: "blog", title: "Bun vs Node 비교", priority: 2, tags: '["runtime","writing"]', stage: "drafting", step: null },
  { id: "BLOG-0003", project: "blog", title: "SQLite 팁 모음", priority: 2, tags: '["db","writing"]', stage: "review", step: null },
  { id: "BLOG-0004", project: "blog", title: "CLI 도구 만들기 시리즈", priority: 3, tags: '["cli","writing"]', stage: "drafting", step: "outlining" },
  { id: "BLOG-0005", project: "blog", title: "오픈소스 기여 가이드", priority: 3, tags: '["oss"]', stage: null, step: null },

  // === TK: 일반 TODO (stage 안 쓰는 케이스) ===
  { id: "TK-0001", project: "tk-cli", title: "JSON-stdin 모드 구현", priority: 2, tags: '["feature"]', stage: null, step: null },
  { id: "TK-0002", project: "tk-cli", title: "workflow.yaml 파서", priority: 3, tags: '["feature","v2"]', stage: null, step: null },
  { id: "TK-0003", project: "tk-cli", title: "테스트 커버리지 90%", priority: 1, tags: '["test"]', stage: null, step: null },
  { id: "TK-0004", project: "tk-cli", title: "컬러 출력 지원", priority: 3, tags: '["ux"]', stage: null, step: null },
  { id: "TK-0005", project: "tk-cli", title: "description 편집 기능", priority: 2, tags: '["feature"]', stage: "dev", step: "coding" },
];

// ─── INSERT + 상태 전이 ───────────────────────────────────

const insertTicket = db.query(`
  INSERT OR IGNORE INTO tickets (id, project, title, priority, tags, stage, step)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const insertHistory = db.query(`
  INSERT INTO ticket_history (ticket_id, event_type, data)
  VALUES (?, ?, ?)
`);

const updateStatus = db.query(`
  UPDATE tickets SET status = ?, updated_at = datetime('now'),
    started_at = CASE WHEN ? = 'in_progress' AND started_at IS NULL THEN datetime('now') ELSE started_at END,
    paused_at = CASE WHEN ? = 'paused' THEN datetime('now') ELSE paused_at END,
    completed_at = CASE WHEN ? IN ('done', 'aborted') THEN datetime('now') ELSE completed_at END
  WHERE id = ?
`);

// 상태 전이 시나리오
interface Transition {
  id: string;
  statuses: string[]; // 순차 전이할 상태들
}

const transitions: Transition[] = [
  // APP: 다양한 상태
  { id: "APP-0002", statuses: ["in_progress"] },                     // running (버그 수정 중)
  { id: "APP-0005", statuses: ["in_progress"] },                     // running (API 개발 중)
  { id: "APP-0007", statuses: ["in_progress"] },                     // running (검증 중)
  { id: "APP-0008", statuses: ["in_progress", "paused"] },           // paused (일시 중단)
  { id: "APP-0001", statuses: ["in_progress", "done"] },             // done (스펙 완료)

  // BLOG: 글쓰기 진행
  { id: "BLOG-0001", statuses: ["in_progress"] },                    // running (편집 중)
  { id: "BLOG-0003", statuses: ["in_progress", "done"] },            // done (발행 완료)

  // TK: TODO 스타일
  { id: "TK-0003", statuses: ["in_progress"] },                      // running (테스트 작성 중)
  { id: "TK-0005", statuses: ["in_progress"] },                      // running (개발 중)
  { id: "TK-0004", statuses: ["in_progress", "paused", "aborted"] }, // aborted (취소)
];

db.transaction(() => {
  // 티켓 삽입
  for (const t of tickets) {
    insertTicket.run(t.id, t.project, t.title, t.priority, t.tags, t.stage, t.step);
    insertHistory.run(t.id, "created", JSON.stringify({ title: t.title, priority: t.priority, stage: t.stage, step: t.step }));
  }

  // 상태 전이 적용
  for (const tr of transitions) {
    for (const status of tr.statuses) {
      updateStatus.run(status, status, status, status, tr.id);
      insertHistory.run(tr.id, status, JSON.stringify({ to: status }));
    }
  }

  // stage 변경 히스토리 샘플 (APP-0001: research → spec)
  insertHistory.run("APP-0001", "stage_changed", JSON.stringify({ from: "research", to: "spec" }));
  insertHistory.run("APP-0001", "step_changed", JSON.stringify({ from: "drafting", to: "reviewing" }));
})();

// ─── 결과 출력 ────────────────────────────────────────────
const counts = db.query(`
  SELECT project, status, COUNT(*) as cnt
  FROM tickets
  GROUP BY project, status
  ORDER BY project, status
`).all() as { project: string; status: string; cnt: number }[];

console.log("\n  Seed 완료!\n");
console.log("  Project      Status     Count");
console.log("  ─────────── ────────── ─────");
for (const r of counts) {
  console.log(`  ${r.project.padEnd(12)} ${r.status.padEnd(10)} ${r.cnt}`);
}

const total = db.query("SELECT COUNT(*) as cnt FROM tickets").get() as { cnt: number };
console.log(`\n  Total: ${total.cnt} tickets across ${projects.length} projects\n`);

db.close();
