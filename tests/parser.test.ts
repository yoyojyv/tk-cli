import { describe, expect, it } from "bun:test";
import { parseArgs } from "../src/utils/parser";

describe("parseArgs", () => {
  it("빈 인자를 처리한다", () => {
    const result = parseArgs([]);
    expect(result.positional).toEqual([]);
    expect(result.flags).toEqual({});
  });

  it("위치 인자만 파싱한다", () => {
    const result = parseArgs(["create", "My task"]);
    expect(result.positional).toEqual(["create", "My task"]);
    expect(result.flags).toEqual({});
  });

  it("--flag value 형식을 파싱한다", () => {
    const result = parseArgs(["--status", "in_progress"]);
    expect(result.flags.status).toBe("in_progress");
  });

  it("--flag=value 형식을 파싱한다", () => {
    const result = parseArgs(["--status=in_progress"]);
    expect(result.flags.status).toBe("in_progress");
  });

  it("불리언 플래그를 파싱한다", () => {
    const result = parseArgs(["--all"]);
    expect(result.flags.all).toBe(true);
  });

  it("연속된 --flag는 각각 불리언으로 처리한다", () => {
    const result = parseArgs(["--all", "--json"]);
    expect(result.flags.all).toBe(true);
    expect(result.flags.json).toBe(true);
  });

  it("-f value 형식을 파싱한다", () => {
    const result = parseArgs(["-p", "1"]);
    expect(result.flags.p).toBe("1");
  });

  it("-f 불리언 플래그를 파싱한다", () => {
    const result = parseArgs(["-a"]);
    expect(result.flags.a).toBe(true);
  });

  it("위치 인자와 플래그를 섞어 처리한다", () => {
    const result = parseArgs(["My task", "--priority", "1", "-t", "bug,urgent"]);
    expect(result.positional).toEqual(["My task"]);
    expect(result.flags.priority).toBe("1");
    expect(result.flags.t).toBe("bug,urgent");
  });

  it("--flag 뒤에 -로 시작하는 값이 오면 불리언으로 처리한다", () => {
    const result = parseArgs(["--all", "-p", "2"]);
    expect(result.flags.all).toBe(true);
    expect(result.flags.p).toBe("2");
  });

  it("booleanFlags로 지정된 플래그는 다음 인자를 소비하지 않는다", () => {
    const result = parseArgs(["--json", "APP-001"], { booleanFlags: ["json"] });
    expect(result.flags.json).toBe(true);
    expect(result.positional).toEqual(["APP-001"]);
  });

  it("booleanFlags 미지정 시 기존 동작과 동일하다", () => {
    const result = parseArgs(["--json", "APP-001"]);
    expect(result.flags.json).toBe("APP-001");
    expect(result.positional).toEqual([]);
  });

  it("짧은 플래그도 booleanFlags가 적용된다", () => {
    const result = parseArgs(["-j", "APP-001"], { booleanFlags: ["j"] });
    expect(result.flags.j).toBe(true);
    expect(result.positional).toEqual(["APP-001"]);
  });
});
