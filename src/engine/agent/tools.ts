/**
 * The agent's tool registry. Each tool declares a JSON Schema for its input
 * (the same shape a model API expects for tool use) and a permission class.
 * The policy, not the planner, decides whether a call may run.
 */

export type Permission = "read" | "network" | "external-write";

export interface ToolSpec {
  name: string;
  description: string;
  permission: Permission;
  input_schema: Record<string, unknown>;
}

export const TOOLS: ToolSpec[] = [
  {
    name: "search_library",
    description: "Search Verian's published case studies and insights. Returns ranked item ids with match reasons.",
    permission: "read",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", minLength: 3, maxLength: 300 },
        strategy: { type: "string", enum: ["keyword", "bm25", "graph", "hybrid", "agentic"], default: "agentic" },
        k: { type: "integer", minimum: 1, maximum: 10, default: 6 },
        filters: {
          type: "object",
          properties: {
            kinds: { type: "array", items: { type: "string", enum: ["case-study", "insight", "news", "event", "webinar", "report"] } },
            countries: { type: "array", items: { type: "string" } },
            since: { type: "string", format: "date" },
          },
          additionalProperties: false,
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "expand_topic",
    description: "List topics that co-occur with a topic in the library, with item counts.",
    permission: "read",
    input_schema: {
      type: "object",
      properties: { topic: { type: "string" } },
      required: ["topic"],
      additionalProperties: false,
    },
  },
  {
    name: "get_item",
    description: "Fetch one library item: title, type, date, country, topics, summary and its veriangroup.com link.",
    permission: "read",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "verify_citations",
    description: "Check that every sentence in a draft quotes a retrieved source on veriangroup.com that relates to the question.",
    permission: "read",
    input_schema: {
      type: "object",
      properties: { draft_id: { type: "string" } },
      required: ["draft_id"],
      additionalProperties: false,
    },
  },
  {
    name: "web_fetch",
    description: "Fetch a page from the public web.",
    permission: "network",
    input_schema: {
      type: "object",
      properties: { url: { type: "string", format: "uri" } },
      required: ["url"],
      additionalProperties: false,
    },
  },
  {
    name: "send_to_client",
    description: "Send an approved brief to a client contact.",
    permission: "external-write",
    input_schema: {
      type: "object",
      properties: { draft_id: { type: "string" }, recipient: { type: "string" } },
      required: ["draft_id", "recipient"],
      additionalProperties: false,
    },
  },
];

export type Decision = "allowed" | "denied" | "needs-approval";

export const POLICY: Record<Permission, { decision: Decision; reason: string }> = {
  read: { decision: "allowed", reason: "Read-only access to the published library." },
  network: { decision: "denied", reason: "This workspace has no internet access. Answers come from the library only." },
  "external-write": {
    decision: "needs-approval",
    reason: "Anything that leaves the building needs a researcher's approval first.",
  },
};

export function decide(toolName: string): { decision: Decision; reason: string } {
  const tool = TOOLS.find((t) => t.name === toolName);
  if (!tool) return { decision: "denied", reason: `Unknown tool “${toolName}”.` };
  return POLICY[tool.permission];
}

/**
 * JSON-Schema check for the subset the tools use: object (required,
 * additionalProperties), array (items), string (length, enum, date and uri
 * formats) and integer (bounds), applied recursively, so nested filters are
 * checked too.
 */
interface Schema {
  type?: "object" | "array" | "string" | "integer";
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  format?: "date" | "uri";
}

function check(schema: Schema, value: unknown, path: string, errors: string[]): void {
  const name = `“${path}”`;
  switch (schema.type) {
    case "object": {
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        errors.push(`${name} must be an object`);
        return;
      }
      const obj = value as Record<string, unknown>;
      for (const key of schema.required ?? []) if (!(key in obj)) errors.push(`missing “${path ? `${path}.` : ""}${key}”`);
      for (const [key, v] of Object.entries(obj)) {
        const sub = schema.properties?.[key];
        const at = path ? `${path}.${key}` : key;
        if (!sub) {
          if (schema.additionalProperties === false) errors.push(`unexpected “${at}”`);
          continue;
        }
        check(sub, v, at, errors);
      }
      return;
    }
    case "array":
      if (!Array.isArray(value)) errors.push(`${name} must be a list`);
      else if (schema.items) value.forEach((v, i) => check(schema.items!, v, `${path}[${i}]`, errors));
      return;
    case "string":
      if (typeof value !== "string") {
        errors.push(`${name} must be text`);
        return;
      }
      if (schema.minLength && value.length < schema.minLength) errors.push(`${name} is too short`);
      if (schema.maxLength && value.length > schema.maxLength) errors.push(`${name} is too long`);
      if (schema.enum && !schema.enum.includes(value)) errors.push(`${name} must be one of ${schema.enum.join(", ")}`);
      if (schema.format === "date" && !(/^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)))) {
        errors.push(`${name} must be a date (yyyy-mm-dd)`);
      }
      if (schema.format === "uri" && !/^https?:\/\/[^\s/]+\.[^\s]+$/.test(value)) errors.push(`${name} must be a web address`);
      return;
    case "integer":
      if (!Number.isInteger(value)) errors.push(`${name} must be a whole number`);
      else {
        if (schema.minimum !== undefined && (value as number) < schema.minimum) errors.push(`${name} is below ${schema.minimum}`);
        if (schema.maximum !== undefined && (value as number) > schema.maximum) errors.push(`${name} is above ${schema.maximum}`);
      }
      return;
  }
}

export function validateInput(toolName: string, input: Record<string, unknown>): string[] {
  const tool = TOOLS.find((t) => t.name === toolName);
  if (!tool) return [`unknown tool ${toolName}`];
  const errors: string[] = [];
  check(tool.input_schema as Schema, input, "", errors);
  return errors;
}
