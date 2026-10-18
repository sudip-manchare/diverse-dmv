import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { emptyProfile } from "../src/shared/contracts";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
test(
  "durable pair transactions, retry identity, history privacy, block and reconnect",
  { skip: !enabled },
  async () => {
    const { getSql } = await import("../src/server/db");
    const {
      sendRequest,
      transitionRequest,
      listRequests,
      listConnections,
      removeConnection,
      blockMember,
      unblockMember,
    } = await import("../src/server/relationships");
    const { sendMessage, messageHistory, listConversations } =
      await import("../src/server/messages");
    const { editProfile, publishProfile, memberProfile, ownProfile } =
      await import("../src/server/profiles");
    const sql = getSql();
    const ids = [randomUUID(), randomUUID(), randomUUID()];
    const [a, b, c] = ids;
    const operation = () => randomUUID();
    try {
      for (let i = 0; i < ids.length; i++) {
        const p = {
          ...emptyProfile(
            ["Alex Example", "Blake Example", "Casey Example"][i],
          ),
          intentions: ["networking"] as const,
          hereFor: "Learn React",
          lookingToConnectWith: "People who offer frontend guidance",
          skills: ["React"],
          fictional: true,
        };
        await sql`INSERT INTO accounts(id,auth_uid,name,email) VALUES(${ids[i]},${"test-" + ids[i]},${p.displayName},${ids[i] + "@example.invalid"})`;
        await sql`INSERT INTO profiles(account_id,data,published,indexing_status) VALUES(${ids[i]},${sql.json(p)},true,'pending')`;
      }
      const sendOperation = operation();
      const request = (await sendRequest(a, {
        recipientId: b,
        introduction: "Fictional test hello",
        operationId: sendOperation,
      })) as any;
      const replay = (await sendRequest(a, {
        recipientId: b,
        introduction: "Fictional test hello",
        operationId: sendOperation,
      })) as any;
      assert.equal(request.request.id, replay.request.id);
      await assert.rejects(
        () =>
          sendRequest(a, {
            recipientId: b,
            introduction: "Changed payload",
            operationId: sendOperation,
          }),
        { code: "IDEMPOTENCY_CONFLICT" },
      );
      await assert.rejects(
        () => sendRequest(b, { recipientId: a, operationId: operation() }),
        { code: "STALE_STATE" },
      );
      assert.equal((await listRequests(b)).incoming.length, 1);
      await assert.rejects(
        () =>
          transitionRequest(c, request.request.id, "accept", {
            operationId: operation(),
          }),
        { code: "UNAVAILABLE" },
      );
      const accepted = (await transitionRequest(
        b,
        request.request.id,
        "accept",
        { operationId: operation() },
      )) as any;
      assert.equal((await listConnections(a)).connections.length, 1);
      assert.equal((await listConnections(b)).connections.length, 1);
      const msgOp = operation();
      const first = await sendMessage(a, {
        recipientId: b,
        body: "Fictional persisted message",
        clientOperationId: msgOp,
      });
      const again = await sendMessage(a, {
        recipientId: b,
        body: "Fictional persisted message",
        clientOperationId: msgOp,
      });
      assert.equal(first.message.id, again.message.id);
      await assert.rejects(
        () =>
          sendMessage(a, {
            recipientId: b,
            body: "Different content",
            clientOperationId: msgOp,
          }),
        { code: "IDEMPOTENCY_CONFLICT" },
      );
      await assert.rejects(
        () =>
          messageHistory(c, first.conversation.id, new URL("http://local/")),
        { code: "UNAVAILABLE" },
      );
      assert.deepEqual((await listConversations(c)).conversations, []);
      await Promise.all(
        Array.from({ length: 35 }, (_, i) =>
          sendMessage(i % 2 ? a : b, {
            recipientId: i % 2 ? b : a,
            body: "Fictional burst " + i,
            clientOperationId: operation(),
          }),
        ),
      );
      const latest = await messageHistory(
        a,
        first.conversation.id,
        new URL("http://local/"),
      );
      assert.equal(latest.messages.length, 30);
      assert.equal(latest.hasMore, true);
      const earlier = await messageHistory(
        a,
        first.conversation.id,
        new URL("http://local/?before=" + latest.before),
      );
      assert.equal(earlier.messages.length, 6);
      const all = [...earlier.messages, ...latest.messages];
      assert.equal(new Set(all.map((m) => m.id)).size, 36);
      const burst = await messageHistory(
        b,
        first.conversation.id,
        new URL("http://local/?after=" + earlier.after),
      );
      assert.equal(burst.messages.length, 30);
      assert.equal(new Set(burst.messages.map((m) => m.id)).size, 30);
      await removeConnection(a, accepted.connectionId, {
        operationId: operation(),
      });
      assert.equal(
        (
          await messageHistory(
            a,
            first.conversation.id,
            new URL("http://local/"),
          )
        ).conversation.canMessage,
        false,
      );
      await assert.rejects(
        () =>
          sendMessage(a, {
            recipientId: b,
            body: "Fictional persisted message",
            clientOperationId: msgOp,
          }),
        { code: "NOT_ALLOWED" },
      );
      await assert.rejects(
        () => sendRequest(a, { recipientId: b, operationId: operation() }),
        { code: "RATE_LIMITED" },
      );
      // Advance the fictional fixture clock boundary by moving ONLY this pair's cooldown into the past.
      await sql`UPDATE pairs SET cooldown_until=clock_timestamp()-interval '1 second' WHERE low_id IN (${a},${b}) AND high_id IN (${a},${b})`;
      const reconnect = (await sendRequest(a, {
        recipientId: b,
        operationId: operation(),
      })) as any;
      await transitionRequest(b, reconnect.request.id, "accept", {
        operationId: operation(),
      });
      const reconnected = await sendMessage(b, {
        recipientId: a,
        body: "Fictional reconnected message",
        clientOperationId: operation(),
      });
      assert.equal(reconnected.conversation.id, first.conversation.id);
      const blocked = (await blockMember(b, {
        blockedId: a,
        operationId: operation(),
      })) as any;
      await assert.rejects(
        () =>
          messageHistory(a, first.conversation.id, new URL("http://local/")),
        { code: "UNAVAILABLE" },
      );
      await assert.rejects(() => memberProfile(a, b), { code: "UNAVAILABLE" });
      assert.deepEqual((await listConversations(b)).conversations, []);
      await unblockMember(b, blocked.block.id, { operationId: operation() });
      assert.equal(
        (
          await messageHistory(
            a,
            first.conversation.id,
            new URL("http://local/"),
          )
        ).conversation.canMessage,
        false,
      );
      const owner = await ownProfile(a);
      await editProfile(a, {
        version: owner.profile.version,
        cosmeticVersion: owner.profile.cosmeticVersion,
        data: { fish: "coral" },
      });
      const cosmetic = await ownProfile(a);
      assert.equal(cosmetic.profile.version, owner.profile.version);
      assert.equal(
        cosmetic.profile.cosmeticVersion,
        owner.profile.cosmeticVersion + 1,
      );
      await assert.rejects(
        () =>
          editProfile(a, {
            version: owner.profile.version,
            cosmeticVersion: owner.profile.cosmeticVersion,
            data: { fish: "indigo" },
          }),
        { code: "STALE_STATE" },
      );
      await publishProfile(a, { version: cosmetic.profile.version }, false);
      await assert.rejects(() => memberProfile(b, a), { code: "UNAVAILABLE" });
      assert.equal(
        (
          await messageHistory(
            b,
            first.conversation.id,
            new URL("http://local/"),
          )
        ).conversation.displayName,
        "Unavailable member",
      );
      await sql`UPDATE accounts SET state='disabled' WHERE id=${a}`;
      await assert.rejects(
        () =>
          editProfile(a, {
            version: 1,
            cosmeticVersion: 1,
            data: { headline: "cannot update" },
          }),
        { code: "UNAUTHENTICATED" },
      );
    } finally {
      await sql`UPDATE conversations SET latest_message_id=NULL WHERE low_id IN ${sql(ids)} OR high_id IN ${sql(ids)}`;
      await sql`DELETE FROM messages WHERE sender_id IN ${sql(ids)}`;
      await sql`DELETE FROM conversations WHERE low_id IN ${sql(ids)} OR high_id IN ${sql(ids)}`;
      await sql`DELETE FROM operations WHERE actor_id IN ${sql(ids)}`;
      await sql`DELETE FROM blocks WHERE blocker_id IN ${sql(ids)} OR blocked_id IN ${sql(ids)}`;
      await sql`DELETE FROM requests WHERE sender_id IN ${sql(ids)} OR recipient_id IN ${sql(ids)}`;
      await sql`DELETE FROM connections WHERE low_id IN ${sql(ids)} OR high_id IN ${sql(ids)}`;
      await sql`DELETE FROM pairs WHERE low_id IN ${sql(ids)} OR high_id IN ${sql(ids)}`;
      await sql`DELETE FROM profiles WHERE account_id IN ${sql(ids)}`;
      await sql`DELETE FROM accounts WHERE id IN ${sql(ids)}`;
      await sql.end();
    }
  },
);
