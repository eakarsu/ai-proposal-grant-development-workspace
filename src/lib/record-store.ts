import { Prisma } from "@prisma/client";
import { RequestError, recordMetadata } from "./record-policy";

export type Row = Record<string, unknown> & { id: string; updatedAt?: Date };
export type Delegate = {
  findMany(args: unknown): Promise<Row[]>;
  findUnique(args: unknown): Promise<Row | null>;
  count(args?: unknown): Promise<number>;
  create(args: unknown): Promise<Row>;
  update(args: unknown): Promise<Row>;
  delete(args: unknown): Promise<Row>;
};
export function records(db: unknown, entity: string): Delegate {
  if (!recordMetadata[entity]) throw new RequestError("Unknown entity", 404);
  return (db as Record<string, Delegate>)[entity[0].toLowerCase() + entity.slice(1)];
}
export async function validateRelations(tx: Prisma.TransactionClient, entity: string, data: Record<string, unknown>) {
  for (const field of recordMetadata[entity].fields) {
    if (!field.relation || !data[field.name]) continue;
    const target = await records(tx, field.relation).findUnique({ where: { id: data[field.name] } });
    if (!target) throw new RequestError(`${field.name} references a record that does not exist`);
    for (const relation of recordMetadata[entity].fields.filter(f => f.relation)) if (recordMetadata[field.relation].fields.some(f => f.name === relation.name && f.relation === relation.relation) && data[relation.name] && target[relation.name] && data[relation.name] !== target[relation.name]) throw new RequestError(`${field.name} conflicts with the selected ${relation.relation}`);
    const parent = recordMetadata[entity].parent;
    if (parent && data[parent.field] && target[parent.field] && data[parent.field] !== target[parent.field]) throw new RequestError(`${field.name} belongs to a different ${parent.entity}`);
  }
}
export function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
export function errorResponse(error: unknown) {
  if (error instanceof RequestError) return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (["P2002", "P2003", "P2025", "P2034"].includes(error.code)) return Response.json({ error: "The record changed or conflicts with existing data. Reload and retry." }, { status: 409 });
  }
  console.error("Request failed", error instanceof Error ? error.name : "UnknownError");
  return Response.json({ error: "The service could not complete the request. Your changes were not confirmed." }, { status: 503 });
}
