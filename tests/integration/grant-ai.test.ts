import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { prisma } from "../../src/lib/prisma";
import { createProject, saveProject } from "../../src/lib/grants/projects";
import { emptyDocument, documentSchema } from "../../src/lib/grants/document";
import { mutation } from "../../src/lib/grants/access";
import {
  generateGrantDraft,
  reviewGrantDraft,
  validateDraft,
} from "../../src/lib/grants/ai";
if (
  !new URL(
    process.env.DATABASE_URL ?? "postgresql://invalid/invalid",
  ).pathname.startsWith("/inspection_test_grant_")
)
  throw Error("Use the isolated grant runner");
test("grant AI drafts cite approved evidence, preserve proposal text until review, and reject stale/foreign access", async () => {
  const users = await Promise.all(
      ["author", "reviewer", "client", "outsider"].map((name) =>
        prisma.user.create({
          data: {
            name,
            email: `${name}-${randomUUID()}@test.invalid`,
            passwordHash: "unused",
            role: "ANALYST",
          },
        }),
      ),
    ),
    [author, reviewer, client, outsider] = users;
  const organization = await prisma.grantOrganization.create({
    data: {
      name: "AI fixture organization",
      memberships: {
        create: [
          { userId: author.id, role: "OWNER" },
          { userId: reviewer.id, role: "REVIEWER" },
          { userId: client.id, role: "CLIENT" },
        ],
      },
    },
  });
  const config = {
    title: "Evidence-backed application",
    funder: "Fixture funder",
    program: "Fixture program",
    dueAt: null,
    currency: "USD" as const,
    document: emptyDocument,
  };
  const created = (await mutation(
    author.id,
    organization.id,
    randomUUID(),
    "create",
    config,
    (tx) => createProject(tx, author.id, organization.id, config),
  )) as { id: string };
  await prisma.grantProjectAccess.createMany({
    data: [reviewer, client].map((u) => ({
      userId: u.id,
      projectId: created.id,
    })),
  });
  const text = "The program served 240 households.",
    source = await prisma.grantSource.create({
      data: {
        projectId: created.id,
        title: "Verified program report",
        fileName: "report.txt",
        mediaType: "text/plain",
        contentHash: "a".repeat(64),
        chunks: [{ id: "paragraph-1", label: "Paragraph 1", text }],
        actorId: author.id,
        approvedBy: reviewer.id,
        approvedAt: new Date(),
      },
    });
  const document = documentSchema.parse({
    ...emptyDocument,
    sections: [
      {
        id: "need",
        title: "Statement of need",
        content: "Original text",
        wordLimit: 100,
        citations: [],
      },
    ],
  });
  await mutation(author.id, organization.id, randomUUID(), "save", {}, (tx) =>
    saveProject(tx, author.id, created.id, {
      ...config,
      document,
      expectedVersion: 1,
      reason: "Prepare section for drafting",
    }),
  );
  const input = {
    task: "DRAFT_SECTION",
    sectionId: "need",
    sourceIds: [source.id],
    instructions: "Draft using the report only.",
    expectedVersion: 2,
    sharingConfirmed: true,
  };
  const output = {
    title: "Statement of need",
    content: text,
    citations: [{ sourceId: source.id, chunkId: "paragraph-1", quote: text }],
    issues: [],
    limitations: ["Only the supplied report was assessed."],
  };
  let calls = 0;
  const provider = (async (_url: unknown, init: RequestInit) => {
    calls++;
    const request = JSON.parse(String(init.body));
    assert.match(request.messages[1].content, /240 households/);
    return Response.json({
      id: `fixture-${calls}`,
      model: "fixture-model",
      choices: [
        { finish_reason: "stop", message: { content: JSON.stringify(output) } },
      ],
      usage: { prompt_tokens: 200, completion_tokens: 50, cost: 0.0123 },
    });
  }) as typeof fetch;
  const previousKey = process.env.OPENROUTER_API_KEY,
    previousModel = process.env.OPENROUTER_MODEL;
  process.env.OPENROUTER_API_KEY = "fixture-only";
  process.env.OPENROUTER_MODEL = "fixture-model";
  try {
    await assert.rejects(
      generateGrantDraft(client.id, created.id, randomUUID(), input, provider),
      /access/,
    );
    await assert.rejects(
      generateGrantDraft(
        outsider.id,
        created.id,
        randomUUID(),
        input,
        provider,
      ),
      /access/,
    );
    await assert.rejects(
      generateGrantDraft(
        author.id,
        created.id,
        randomUUID(),
        { ...input, sharingConfirmed: false },
        provider,
      ),
    );
    const key = randomUUID(),
      draft = await generateGrantDraft(
        author.id,
        created.id,
        key,
        input,
        provider,
      );
    assert.equal(draft.status, "DRAFT");
    assert.equal(Number(draft.costUsd), 0.0123);
    assert.equal(draft.inputTokens, 200);
    await generateGrantDraft(author.id, created.id, key, input, provider);
    assert.equal(calls, 1);
    assert.equal(
      documentSchema.parse(
        (
          await prisma.grantProject.findUniqueOrThrow({
            where: { id: created.id },
          })
        ).document,
      ).sections[0].content,
      "Original text",
    );
    await assert.rejects(
      generateGrantDraft(
        author.id,
        created.id,
        key,
        { ...input, instructions: "Changed request" },
        provider,
      ),
      /different input/,
    );
    const review = {
        id: draft.id,
        action: "APPLY",
        expectedVersion: 2,
        notes: "Reviewed exact quoted report and wording",
        reviewConfirmed: true,
      },
      applyKey = randomUUID();
    await mutation(
      author.id,
      organization.id,
      applyKey,
      "ai.review",
      review,
      (tx) => reviewGrantDraft(tx, author.id, created.id, review),
    );
    await mutation(
      author.id,
      organization.id,
      applyKey,
      "ai.review",
      review,
      (tx) => reviewGrantDraft(tx, author.id, created.id, review),
    );
    const applied = await prisma.grantProject.findUniqueOrThrow({
      where: { id: created.id },
    });
    assert.equal(applied.version, 3);
    assert.equal(
      documentSchema.parse(applied.document).sections[0].content,
      text,
    );
    assert.equal(applied.status, "DRAFT");
    assert.equal(
      (await prisma.grantAiDraft.findUniqueOrThrow({ where: { id: draft.id } }))
        .status,
      "APPLIED",
    );
    const stale = await generateGrantDraft(
      author.id,
      created.id,
      randomUUID(),
      { ...input, expectedVersion: 3 },
      provider,
    );
    await mutation(author.id, organization.id, randomUUID(), "edit", {}, (tx) =>
      saveProject(tx, author.id, created.id, {
        ...config,
        document: documentSchema.parse(applied.document),
        expectedVersion: 3,
        reason: "Changed proposal metadata",
        title: "Updated title",
      }),
    );
    await assert.rejects(
      mutation(
        author.id,
        organization.id,
        randomUUID(),
        "apply-stale",
        {},
        (tx) =>
          reviewGrantDraft(tx, author.id, created.id, {
            ...review,
            id: stale.id,
            expectedVersion: 4,
          }),
      ),
      /changed/,
    );
    const latest = { ...input, expectedVersion: 4 };
    const badProvider = (async () =>
      Response.json({
        id: "bad-fixture",
        model: "fixture-model",
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: JSON.stringify({
                ...output,
                citations: [
                  {
                    sourceId: source.id,
                    chunkId: "paragraph-1",
                    quote: "Invented result",
                  },
                ],
              }),
            },
          },
        ],
        usage: { cost: 0.01 },
      })) as typeof fetch;
    const invalid = await generateGrantDraft(
      author.id,
      created.id,
      randomUUID(),
      latest,
      badProvider,
    );
    assert.equal(invalid.status, "FAILED");
    assert.equal(invalid.providerRef, "bad-fixture");
    assert.equal(Number(invalid.costUsd), 0.01);
    let unknownCalls = 0;
    const uncertain = (async () => {
        unknownCalls++;
        throw Error("Timeout");
      }) as typeof fetch,
      unknownKey = randomUUID();
    const unknown = await generateGrantDraft(
      author.id,
      created.id,
      unknownKey,
      latest,
      uncertain,
    );
    assert.equal(unknown.status, "UNKNOWN");
    await generateGrantDraft(
      author.id,
      created.id,
      unknownKey,
      latest,
      uncertain,
    );
    assert.equal(unknownCalls, 1);
    const revoked = await generateGrantDraft(
      author.id,
      created.id,
      randomUUID(),
      latest,
      provider,
    );
    await prisma.grantMembership.update({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: reviewer.id,
        },
      },
      data: { active: false },
    });
    await assert.rejects(
      mutation(
        author.id,
        organization.id,
        randomUUID(),
        "apply-revoked",
        {},
        (tx) =>
          reviewGrantDraft(tx, author.id, created.id, {
            ...review,
            id: revoked.id,
            expectedVersion: 4,
          }),
      ),
      /access/,
    );
    await assert.rejects(
      generateGrantDraft(author.id, created.id, randomUUID(), latest, provider),
      /access/,
    );
    assert.throws(() => validateDraft(output, [source], 3), /word limit/);
  } finally {
    if (previousKey === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previousKey;
    if (previousModel === undefined) delete process.env.OPENROUTER_MODEL;
    else process.env.OPENROUTER_MODEL = previousModel;
    await prisma.$disconnect();
  }
});
