import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { runNst } from "../lib/shell.js";

export function register(server: McpServer): void {
  // =========================================================================
  // Vault Secrets (9 tools)
  // =========================================================================

  server.tool(
    "nst_vault_projects_list",
    "List all projects in NanteVault",
    {},
    async () => runNst(["vault", "projects", "list", "--json"]),
  );

  server.tool(
    "nst_vault_envs_list",
    "List environments in a NanteVault project",
    { project: z.string().describe("Project slug") },
    async ({ project }) =>
      runNst(["vault", "envs", "list", "-p", project, "--json"]),
  );

  server.tool(
    "nst_vault_secrets_list",
    "List secret keys in a NanteVault project/environment (keys only, no values)",
    {
      project: z.string().describe("Project slug"),
      env: z
        .string()
        .optional()
        .describe("Environment slug (defaults to 'dev')"),
    },
    async ({ project, env }) => {
      const args = ["vault", "secrets", "list", "-p", project, "--json"];
      if (env) args.push("-e", env);
      return runNst(args);
    },
  );

  server.tool(
    "nst_vault_secrets_get",
    "Get a secret value from NanteVault",
    {
      project: z.string().describe("Project slug"),
      key: z.string().describe("Secret key name"),
      env: z
        .string()
        .optional()
        .describe("Environment slug (defaults to 'dev')"),
    },
    async ({ project, key, env }) => {
      const args = ["vault", "secrets", "get", key, "-p", project, "--json"];
      if (env) args.push("-e", env);
      return runNst(args);
    },
  );

  server.tool(
    "nst_vault_secrets_set",
    "Set a secret value in NanteVault",
    {
      project: z.string().describe("Project slug"),
      key: z.string().describe("Secret key name"),
      value: z.string().describe("Secret value"),
      env: z
        .string()
        .optional()
        .describe("Environment slug (defaults to 'dev')"),
      description: z
        .string()
        .optional()
        .describe("Human-readable description of this secret"),
    },
    async ({ project, key, value, env, description }) => {
      const args = [
        "vault",
        "secrets",
        "set",
        `${key}=${value}`,
        "-p",
        project,
      ];
      if (env) args.push("-e", env);
      if (description) args.push("--description", description);
      return runNst(args);
    },
  );

  server.tool(
    "nst_vault_secrets_delete",
    "Delete a secret from NanteVault",
    {
      project: z.string().describe("Project slug"),
      key: z.string().describe("Secret key name"),
      env: z
        .string()
        .optional()
        .describe("Environment slug (defaults to 'dev')"),
    },
    async ({ project, key, env }) => {
      const args = ["vault", "secrets", "delete", key, "-p", project];
      if (env) args.push("-e", env);
      return runNst(args);
    },
  );

  server.tool(
    "nst_vault_secrets_deleted",
    "List soft-deleted secrets in a NanteVault project/environment that can be restored (retained for 30 days)",
    {
      project: z.string().describe("Project slug"),
      env: z
        .string()
        .optional()
        .describe("Environment slug (defaults to 'dev')"),
    },
    async ({ project, env }) => {
      const args = ["vault", "secrets", "deleted", "-p", project, "--json"];
      if (env) args.push("-e", env);
      return runNst(args);
    },
  );

  server.tool(
    "nst_vault_secrets_restore",
    "Restore a soft-deleted secret in NanteVault",
    {
      project: z.string().describe("Project slug"),
      key: z.string().describe("Secret key to restore"),
      env: z
        .string()
        .optional()
        .describe("Environment slug (defaults to 'dev')"),
    },
    async ({ project, key, env }) => {
      const args = ["vault", "secrets", "restore", key, "-p", project];
      if (env) args.push("-e", env);
      return runNst(args);
    },
  );

  server.tool(
    "nst_vault_secrets_import",
    "Import secrets from .env format content into NanteVault",
    {
      project: z.string().describe("Project slug"),
      env: z.string().describe("Environment slug"),
      dotenv_content: z
        .string()
        .describe("Content in .env format (KEY=value, one per line)"),
    },
    async ({ project, env, dotenv_content }) =>
      runNst(
        ["vault", "secrets", "import", "-p", project, "-e", env, "--yes"],
        { stdin: dotenv_content },
      ),
  );

  // =========================================================================
  // Vault Files (6 tools)
  // =========================================================================

  server.tool(
    "nst_vault_files_list",
    "List files stored in a NanteVault project/environment",
    {
      project: z.string().describe("Project slug"),
      env: z
        .string()
        .optional()
        .describe("Environment slug (defaults to 'dev')"),
    },
    async ({ project, env }) => {
      const args = ["vault", "files", "list", "-p", project, "--json"];
      if (env) args.push("-e", env);
      return runNst(args);
    },
  );

  server.tool(
    "nst_vault_files_get",
    "Get a file from NanteVault. Returns file metadata and base64-encoded content. Pass save_to to write to local disk instead.",
    {
      project: z.string().describe("Project slug"),
      name: z.string().describe("File name in vault"),
      env: z
        .string()
        .optional()
        .describe("Environment slug (defaults to 'dev')"),
      save_to: z
        .string()
        .optional()
        .describe(
          "Local path to save the file to (optional — if omitted, returns base64 data)",
        ),
    },
    async ({ project, name, env, save_to }) => {
      const args = ["vault", "files", "get", name, "-p", project, "--json"];
      if (env) args.push("-e", env);
      if (save_to) args.push("--save-to", save_to);
      return runNst(args);
    },
  );

  server.tool(
    "nst_vault_files_put",
    "Upload a file to NanteVault. Content must be base64-encoded. Max 10 MB.",
    {
      project: z.string().describe("Project slug"),
      name: z.string().describe("Logical name for the file in vault"),
      content_base64: z
        .string()
        .describe("Base64-encoded file content (max 10 MB decoded)"),
      env: z
        .string()
        .optional()
        .describe("Environment slug (defaults to 'dev')"),
      content_type: z
        .string()
        .optional()
        .describe(
          "MIME content type (e.g. application/json, application/x-pem-file)",
        ),
      description: z.string().optional().describe("Description of the file"),
    },
    async ({ project, name, content_base64, env, content_type, description }) => {
      const args = ["vault", "files", "put", name, "-p", project];
      if (env) args.push("-e", env);
      if (content_type) args.push("--content-type", content_type);
      if (description) args.push("--description", description);
      // Pass base64 content via stdin
      return runNst(args, { stdin: content_base64 });
    },
  );

  server.tool(
    "nst_vault_files_delete",
    "Soft-delete a file from NanteVault. Can be restored within 30 days.",
    {
      project: z.string().describe("Project slug"),
      name: z.string().describe("File name to delete"),
      env: z
        .string()
        .optional()
        .describe("Environment slug (defaults to 'dev')"),
    },
    async ({ project, name, env }) => {
      const args = ["vault", "files", "delete", name, "-p", project];
      if (env) args.push("-e", env);
      return runNst(args);
    },
  );

  server.tool(
    "nst_vault_files_deleted",
    "List soft-deleted files in a NanteVault project/environment that can be restored (retained for 30 days)",
    {
      project: z.string().describe("Project slug"),
      env: z
        .string()
        .optional()
        .describe("Environment slug (defaults to 'dev')"),
    },
    async ({ project, env }) => {
      const args = ["vault", "files", "deleted", "-p", project, "--json"];
      if (env) args.push("-e", env);
      return runNst(args);
    },
  );

  server.tool(
    "nst_vault_files_restore",
    "Restore a previously soft-deleted file in NanteVault",
    {
      project: z.string().describe("Project slug"),
      name: z.string().describe("File name to restore"),
      env: z
        .string()
        .optional()
        .describe("Environment slug (defaults to 'dev')"),
    },
    async ({ project, name, env }) => {
      const args = ["vault", "files", "restore", name, "-p", project];
      if (env) args.push("-e", env);
      return runNst(args);
    },
  );
}
