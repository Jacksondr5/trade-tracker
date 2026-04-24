import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  type BravosKnowledgeExtractionInput,
  bravosKnowledgeExtractionInputSchema,
} from "../../src/lib/bravos-ai/knowledge-extraction-schema";
import { extractBravosKnowledge } from "../../src/lib/bravos-ai/knowledge-extraction-runner";

interface CliArgs {
  model?: string;
  outputPath?: string;
  rawInputPath?: string;
  sourceId?: string;
  sourcePublishedAt?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  transcriptFilePath?: string;
}

function printUsage() {
  console.error(`Usage:
  pnpm bravos:extract --input <input.json> [--output <output.json>] [--model <provider/model>]
  pnpm bravos:extract --transcript-file <transcript.md> --source-published-at <ISO-8601> [--source-id <id>] [--source-title <title>] [--source-url <url>] [--output <output.json>] [--model <provider/model>]

JSON mode:
  Input JSON must match the BravosKnowledgeExtractionInput schema.

Transcript-file mode:
  The transcript file is read as plain text and inserted into the prompt.
  sourceId defaults to local:<file-basename>
  sourceTitle defaults to the file basename
  sourceUrl defaults to null`);
}

function parseArgs(argv: string[]): CliArgs {
  let rawInputPath: string | undefined;
  let model: string | undefined;
  let outputPath: string | undefined;
  let sourceId: string | undefined;
  let sourcePublishedAt: string | undefined;
  let sourceTitle: string | undefined;
  let sourceUrl: string | undefined;
  let transcriptFilePath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = argv[index + 1];

    if (arg === "--input") {
      if (!next) {
        throw new Error("Missing value for --input.");
      }
      rawInputPath = next;
      index += 1;
      continue;
    }

    if (arg === "--transcript-file") {
      if (!next) {
        throw new Error("Missing value for --transcript-file.");
      }
      transcriptFilePath = next;
      index += 1;
      continue;
    }

    if (arg === "--output") {
      if (!next) {
        throw new Error("Missing value for --output.");
      }
      outputPath = next;
      index += 1;
      continue;
    }

    if (arg === "--model") {
      if (!next) {
        throw new Error("Missing value for --model.");
      }
      model = next;
      index += 1;
      continue;
    }

    if (arg === "--source-id") {
      if (!next) {
        throw new Error("Missing value for --source-id.");
      }
      sourceId = next;
      index += 1;
      continue;
    }

    if (arg === "--source-title") {
      if (!next) {
        throw new Error("Missing value for --source-title.");
      }
      sourceTitle = next;
      index += 1;
      continue;
    }

    if (arg === "--source-published-at") {
      if (!next) {
        throw new Error("Missing value for --source-published-at.");
      }
      sourcePublishedAt = next;
      index += 1;
      continue;
    }

    if (arg === "--source-url") {
      if (!next) {
        throw new Error("Missing value for --source-url.");
      }
      sourceUrl = next;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (rawInputPath && transcriptFilePath) {
    throw new Error("Use either --input or --transcript-file, not both.");
  }

  if (!rawInputPath && !transcriptFilePath) {
    throw new Error(
      "Missing required input. Use either --input or --transcript-file.",
    );
  }

  if (transcriptFilePath && !sourcePublishedAt) {
    throw new Error(
      "Transcript-file mode requires --source-published-at in ISO 8601 format.",
    );
  }

  return {
    model,
    outputPath,
    rawInputPath,
    sourceId,
    sourcePublishedAt,
    sourceTitle,
    sourceUrl,
    transcriptFilePath,
  };
}

async function readStructuredInput(
  args: CliArgs,
): Promise<BravosKnowledgeExtractionInput> {
  if (args.rawInputPath) {
    const rawInput = await readFile(args.rawInputPath, "utf8");
    const parsedJson = JSON.parse(rawInput) as unknown;
    return bravosKnowledgeExtractionInputSchema.parse(parsedJson);
  }

  if (!args.transcriptFilePath || !args.sourcePublishedAt) {
    throw new Error("Transcript-file mode is missing required arguments.");
  }

  const transcript = await readFile(args.transcriptFilePath, "utf8");
  const basename = path.basename(args.transcriptFilePath);
  const basenameWithoutExtension = basename.replace(/\.[^.]+$/, "") || basename;

  return bravosKnowledgeExtractionInputSchema.parse({
    sourceId: args.sourceId ?? `local:${basenameWithoutExtension}`,
    sourcePublishedAt: args.sourcePublishedAt,
    sourceTitle: args.sourceTitle ?? basenameWithoutExtension,
    sourceUrl: args.sourceUrl ?? null,
    transcript,
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = await readStructuredInput(args);

  const output = await extractBravosKnowledge(input, {
    model: args.model,
  });

  const serialized = JSON.stringify(output, null, 2);

  if (args.outputPath) {
    await mkdir(path.dirname(args.outputPath), { recursive: true });
    await writeFile(args.outputPath, `${serialized}\n`, "utf8");
    console.error(`Wrote extraction result to ${args.outputPath}`);
    return;
  }

  process.stdout.write(`${serialized}\n`);
}

try {
  await main();
} catch (error) {
  printUsage();
  console.error(
    error instanceof Error ? error.message : "Unknown extractor failure.",
  );
  process.exitCode = 1;
}
