import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { emptyProfile } from "../src/shared/contracts";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
test(
  "reverse send, accept/cancel/block, request allowance and restriction races serialize",
  { skip: !enabled },
  async () => {
    const { getSql } = await import("../src/server/db");
    const { sendRequest, transitionRequest, blockMember } =
      await import("../src/server/relationships");
    const { sendMessage, messageHistory } =
      await import("../src/server/messages");
    const sql = getSql();
    const ids: string[] = [];
    async function account() {
      const id = randomUUID();
      ids.push(id);
      const p = {
        ...emptyProfile("Fictional race member"),
        intentions: ["networking"],
        hereFor: "Learn together",
        lookingToConnectWith: "Peers",
        skills: ["Testing"],
        fictional: true,
      };
      await sql`INSERT INTO accounts(id,auth_uid,name,email) VALUES(${id},${"test-" + id},'Fictional race member',${id + "@example.invalid"})`;
      await sql`INSERT INTO profiles(account_id,data,published,indexing_status) VALUES(${id},${sql.json(p)},true,'pending')`;
      return id;
    }
    const op = () => ({ operationId: randomUUID() });
    try {
      const a = await account(),
        b = await account();
      const reversed = await Promise.allSettled([
        sendRequest(a, { recipientId: b, ...op() }),
        sendRequest(b, { recipientId: a, ...op() }),
      ]);
      assert.equal(reversed.filter((r) => r.status === "fulfilled").length, 1);
      const [pending] =
        await sql`SELECT * FROM requests WHERE (sender_id=${a} AND recipient_id=${b}) OR (sender_id=${b} AND recipient_id=${a})`;
      const race = await Promise.allSettled([
        transitionRequest(pending.recipient_id, pending.id, "accept", op()),
        transitionRequest(pending.sender_id, pending.id, "cancel", op()),
      ]);
      assert.equal(race.filter((r) => r.status === "fulfilled").length, 1);
      const [settled] =
        await sql`SELECT status FROM requests WHERE id=${pending.id}`;
      const [active] =
        await sql`SELECT count(*)::int AS count FROM connections WHERE (low_id=${a} OR high_id=${a}) AND active=true`;
      assert.equal(active.count, settled.status === "accepted" ? 1 : 0);
      const d = await account(),
        e = await account();
      const req = (await sendRequest(d, { recipientId: e, ...op() })) as any;
      await Promise.allSettled([
        transitionRequest(e, req.request.id, "accept", op()),
        blockMember(e, { blockedId: d, ...op() }),
      ]);
      const [connection] =
        await sql`SELECT count(*)::int AS count FROM connections WHERE (low_id=${d} OR high_id=${d}) AND active=true`;
      assert.equal(connection.count, 0);
      await assert.rejects(
        () =>
          sendMessage(d, {
            recipientId: e,
            body: "blocked",
            clientOperationId: randomUUID(),
          }),
        { code: "UNAVAILABLE" },
      );
      const sender = await account(),
        recipients = [];
      for (let i = 0; i < 22; i++) recipients.push(await account());
      const operationIds = recipients.map(() => randomUUID());
      const results = await Promise.allSettled(
        recipients.map((recipientId, i) =>
          sendRequest(sender, { recipientId, operationId: operationIds[i] }),
        ),
      );
      assert.equal(results.filter((r) => r.status === "fulfilled").length, 20);
      assert.equal(
        results.filter(
          (r) => r.status === "rejected" && r.reason.code === "RATE_LIMITED",
        ).length,
        2,
      );
      const winner = results.findIndex((r) => r.status === "fulfilled");
      await sendRequest(sender, {
        recipientId: recipients[winner],
        operationId: operationIds[winner],
      });
      const [quota] =
        await sql`SELECT count(*)::int AS count FROM requests WHERE sender_id=${sender}`;
      assert.equal(quota.count, 20);
      const x = await account(),
        y = await account();
      const xy = (await sendRequest(x, { recipientId: y, ...op() })) as any;
      await transitionRequest(y, xy.request.id, "accept", op());
      const first = await sendMessage(x, {
        recipientId: y,
        body: "Before restriction",
        clientOperationId: randomUUID(),
      });
      await Promise.allSettled([
        sendMessage(x, {
          recipientId: y,
          body: "Racing restriction",
          clientOperationId: randomUUID(),
        }),
        sql.begin(async (tx) => {
          await tx`SELECT id FROM accounts WHERE id=${y} FOR UPDATE`;
          await tx`UPDATE profiles SET published=false WHERE account_id=${y}`;
        }),
      ]);
      await assert.rejects(
        () =>
          sendMessage(x, {
            recipientId: y,
            body: "After restriction",
            clientOperationId: randomUUID(),
          }),
        { code: "UNAVAILABLE" },
      );
      assert.equal(
        (
          await messageHistory(
            x,
            first.conversation.id,
            new URL("http://local/"),
          )
        ).conversation.canMessage,
        false,
      );
      await sql`UPDATE accounts SET state='disabled' WHERE id=${x}`;
      await assert.rejects(
        () =>
          sendMessage(x, {
            recipientId: y,
            body: "Disabled actor",
            clientOperationId: randomUUID(),
          }),
        { code: "UNAVAILABLE" },
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
