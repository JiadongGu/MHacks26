import { describe, expect, it } from "vitest";
import {
  buildAgentPath,
  withUserBody,
  withUserQuery,
} from "@/lib/agent-proxy";
import { isTeamEmail, parseEmailList } from "@/lib/team";

const ME = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";

describe("parseEmailList", () => {
  it("trims, lower-cases, and drops empty entries", () => {
    expect(parseEmailList(" A@x.com, ,b@Y.com ")).toEqual(["a@x.com", "b@y.com"]);
    expect(parseEmailList(undefined)).toEqual([]);
  });
});

describe("isTeamEmail", () => {
  it("matches without regard to case", () => {
    expect(isTeamEmail("J@x.com", "j@x.com,p@x.com")).toBe(true);
  });
  it("admits nobody when the list is empty", () => {
    expect(isTeamEmail("j@x.com", "")).toBe(false);
    expect(isTeamEmail(null, "j@x.com")).toBe(false);
  });
});

describe("agent proxy helpers", () => {
  it("overwrites a client user_id in the query", () => {
    const q = withUserQuery(new URLSearchParams(`user_id=${OTHER}&metric=steps`), ME);
    expect(q.getAll("user_id")).toEqual([ME]);
    expect(q.get("metric")).toBe("steps");
  });

  it("overwrites a client user_id in the body", () => {
    expect(withUserBody(JSON.stringify({ user_id: OTHER, a: 1 }), ME)).toEqual({
      user_id: ME,
      a: 1,
    });
    expect(withUserBody("", ME)).toEqual({ user_id: ME });
  });

  it("rejects a body that is not a JSON object", () => {
    expect(withUserBody("[1]", ME)).toBeNull();
    expect(withUserBody("not json", ME)).toBeNull();
  });

  it("rejects dot segments and another user's uuid in the path", () => {
    expect(buildAgentPath(["vitals", ".."], ME)).toMatchObject({ ok: false, status: 400 });
    expect(buildAgentPath(["twin", OTHER], ME)).toMatchObject({ ok: false, status: 403 });
    expect(buildAgentPath(["twin", ME], ME)).toEqual({ ok: true, path: `/twin/${ME}` });
    expect(buildAgentPath(["vitals", "latest"], ME)).toEqual({ ok: true, path: "/vitals/latest" });
  });
});
