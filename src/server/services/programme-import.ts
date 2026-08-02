/**
 * Server-side shim — the parser itself lives in src/lib/programme-parse
 * so the import dialog can run it in the browser. Server code (import
 * mutation, smoke tests) keeps importing from here unchanged.
 */
export {
  detectAndParse,
  parseMSProjectXML,
  parseP6XML,
  type ParsedTask,
  type ParseResult,
  type ProgrammeFormat,
} from "@/lib/programme-parse";
