import { pluginCatalog } from "@/lib/platform/registry";
import { DATA_PROVIDER_PLUGINS, IMPORT_PROVIDER_DESCRIPTORS } from "@/lib/platform/data";

export async function GET() {
  const plugins = pluginCatalog(); return Response.json({ compatibilityVersion: "1.0", plugins, counts: Object.fromEntries([...new Set(plugins.map((plugin) => plugin.kind))].map((kind) => [kind, plugins.filter((plugin) => plugin.kind === kind).length])), providers: [...DATA_PROVIDER_PLUGINS.map((provider) => ({ id: provider.id, name: provider.name, markets: provider.markets, credentialEnvironmentVariables: provider.credentialEnvironmentVariables })), ...IMPORT_PROVIDER_DESCRIPTORS] }, { headers: { "Cache-Control": "public, max-age=300", "X-Content-Type-Options": "nosniff" } });
}
