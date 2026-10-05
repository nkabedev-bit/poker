import { describe, expect, it } from "vitest";
import { relayTargetPath } from "@/lib/telegram/relay-path";

const ADMIN_TOKEN = "111:admin-token";
const CLIENT_TOKEN = "222:client_token";
const TOKENS = [ADMIN_TOKEN, CLIENT_TOKEN];

describe("relayTargetPath", () => {
  it("lets a method call of either club bot through", () => {
    expect(relayTargetPath([`bot${ADMIN_TOKEN}`, "sendMessage"], TOKENS)).toBe(
      `bot${ADMIN_TOKEN}/sendMessage`,
    );
    expect(relayTargetPath([`bot${CLIENT_TOKEN}`, "getFile"], TOKENS)).toBe(
      `bot${CLIENT_TOKEN}/getFile`,
    );
  });

  it("lets a file download through with its folders", () => {
    expect(relayTargetPath(["file", `bot${CLIENT_TOKEN}`, "photos", "file_12.jpg"], TOKENS)).toBe(
      `file/bot${CLIENT_TOKEN}/photos/file_12.jpg`,
    );
  });

  it("refuses a bot that is not the club's", () => {
    expect(relayTargetPath(["bot333:stranger", "sendMessage"], TOKENS)).toBeNull();
    expect(relayTargetPath(["file", "bot333:stranger", "photos", "a.jpg"], TOKENS)).toBeNull();
  });

  it("refuses a token that only starts like a club one", () => {
    expect(relayTargetPath([`bot${ADMIN_TOKEN}x`, "sendMessage"], TOKENS)).toBeNull();
    expect(relayTargetPath(["bot111", "sendMessage"], TOKENS)).toBeNull();
  });

  it("refuses everything when no bot token is configured", () => {
    expect(relayTargetPath(["bot", "sendMessage"], ["", ""])).toBeNull();
    expect(relayTargetPath([`bot${ADMIN_TOKEN}`, "sendMessage"], [])).toBeNull();
  });

  it("refuses paths that are neither a method call nor a file", () => {
    expect(relayTargetPath([`bot${ADMIN_TOKEN}`], TOKENS)).toBeNull();
    expect(relayTargetPath([`bot${ADMIN_TOKEN}`, "sendMessage", "extra"], TOKENS)).toBeNull();
    expect(relayTargetPath([`bot${ADMIN_TOKEN}`, "send-message"], TOKENS)).toBeNull();
    expect(relayTargetPath(["file", `bot${ADMIN_TOKEN}`], TOKENS)).toBeNull();
    expect(relayTargetPath([ADMIN_TOKEN, "sendMessage"], TOKENS)).toBeNull();
  });

  it("refuses a file path that steps out of its folder", () => {
    expect(relayTargetPath(["file", `bot${ADMIN_TOKEN}`, "..", "secret"], TOKENS)).toBeNull();
    expect(relayTargetPath(["file", `bot${ADMIN_TOKEN}`, ".hidden"], TOKENS)).toBeNull();
  });
});
