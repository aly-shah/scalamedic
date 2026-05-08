/* eslint-disable no-var */

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { capitalizeWords, normalizeEmail } from "./string-case";

const DATABASE_URL =
  process.env.DATABASE_URL ||
  "postgresql://medicore_user:clinic_erp_dev@localhost:5432/medicore";

/** Per-model lists of fields that get auto-normalized on every write.
 *  Centralized so adding a new name-bearing or email-bearing model is
 *  a one-line change. The extension below is auto-applied to every
 *  write Prisma issues, so no route code has to remember it. */
const NAME_FIELDS_BY_MODEL: Record<string, readonly string[]> = {
  Patient: ["firstName", "middleName", "lastName"],
  User: ["name"],
};

const EMAIL_FIELDS_BY_MODEL: Record<string, readonly string[]> = {
  // Lowercase + trim for storage. Patient.email has a partial-unique
  // index on (email) WHERE email IS NOT NULL AND deletedAt IS NULL —
  // canonical form is required so we don't write "Foo@x.com" and
  // "foo@x.com" as two distinct rows.
  Patient: ["email"],
  User: ["email"],
  Lead: ["email"],
  Branch: ["email"],
};

type Transform = (v: unknown) => unknown;

/** Walk a `data` argument and apply the given transform to each
 *  listed string field. Tolerates Prisma's update-style `{ set: "..." }`
 *  wrapper too. Anything non-string is left untouched. */
function applyTransform(
  fields: readonly string[],
  fn: Transform,
  data: unknown,
): unknown {
  if (!data || typeof data !== "object" || Array.isArray(data)) return data;
  const next: Record<string, unknown> = { ...(data as Record<string, unknown>) };
  for (const f of fields) {
    const v = next[f];
    if (typeof v === "string") {
      next[f] = fn(v);
    } else if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      "set" in (v as Record<string, unknown>) &&
      typeof (v as { set: unknown }).set === "string"
    ) {
      next[f] = { ...(v as object), set: fn((v as { set: string }).set) };
    }
  }
  return next;
}

/** Compose all normalizers for a given model into a single pass over
 *  the data payload. Currently: capitalize names, then lowercase
 *  emails. Order doesn't matter since the field sets don't overlap. */
function normalizePayload(model: string, data: unknown): unknown {
  let out = data;
  const nameFields = NAME_FIELDS_BY_MODEL[model];
  if (nameFields) out = applyTransform(nameFields, capitalizeWords as Transform, out);
  const emailFields = EMAIL_FIELDS_BY_MODEL[model];
  if (emailFields) out = applyTransform(emailFields, normalizeEmail as Transform, out);
  return out;
}

/** Set of models we have any transform for — short-circuit the
 *  extension hot path when a write hits an unrelated model. */
const NORMALIZED_MODELS = new Set<string>([
  ...Object.keys(NAME_FIELDS_BY_MODEL),
  ...Object.keys(EMAIL_FIELDS_BY_MODEL),
]);

function makeClient() {
  const adapter = new PrismaPg({ connectionString: DATABASE_URL });
  return new PrismaClient({ adapter }).$extends({
    name: "field-normalizer", // names + emails (see *_FIELDS_BY_MODEL)
    query: {
      $allModels: {
        async create({ model, args, query }) {
          if (NORMALIZED_MODELS.has(model)) {
            args.data = normalizePayload(model, args.data) as typeof args.data;
          }
          return query(args);
        },
        async update({ model, args, query }) {
          if (NORMALIZED_MODELS.has(model)) {
            args.data = normalizePayload(model, args.data) as typeof args.data;
          }
          return query(args);
        },
        async updateMany({ model, args, query }) {
          if (NORMALIZED_MODELS.has(model)) {
            args.data = normalizePayload(model, args.data) as typeof args.data;
          }
          return query(args);
        },
        async upsert({ model, args, query }) {
          if (NORMALIZED_MODELS.has(model)) {
            args.create = normalizePayload(model, args.create) as typeof args.create;
            args.update = normalizePayload(model, args.update) as typeof args.update;
          }
          return query(args);
        },
        async createMany({ model, args, query }) {
          if (NORMALIZED_MODELS.has(model) && args.data) {
            args.data = (Array.isArray(args.data)
              ? args.data.map((d) => normalizePayload(model, d))
              : normalizePayload(model, args.data)) as typeof args.data;
          }
          return query(args);
        },
      },
    },
  });
}

type ExtendedClient = ReturnType<typeof makeClient>;

declare global {
  var __prisma: ExtendedClient | undefined;
}

export const prisma: ExtendedClient = globalThis.__prisma ?? makeClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}

export default prisma;
