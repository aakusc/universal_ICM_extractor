import { getVendorAuth, getInterpreterConfig } from './config/index.js';
import { Pipeline } from './normalizer/pipeline.js';
import { vendorIdSchema, type VendorId } from './types/normalized-schema.js';
import type { IConnector } from './types/connector.js';
import { CaptivateIQConnector } from './connectors/captivateiq/connector.js';
import * as fs from 'node:fs';

/**
 * CLI entry point for the Universal ICM Connector.
 *
 * Usage:
 *   npx tsx src/cli.ts extract --vendor varicent --plan FY2026
 *   npx tsx src/cli.ts normalize --input raw.json --output normalized.json
 *   npx tsx src/cli.ts pipeline --vendor varicent --plan FY2026 --output result.json
 */

const args = process.argv.slice(2);
const command = args[0];

function loadConnector(vendor: VendorId): IConnector {
  switch (vendor) {
    case 'captivateiq':
      return new CaptivateIQConnector();
    default:
      throw new Error(`Connector not yet implemented for vendor: ${vendor}`);
  }
}

function getArg(name: string): string | undefined {
  const index = args.indexOf(`--${name}`);
  return index !== -1 ? args[index + 1] : undefined;
}

function requireArg(name: string): string {
  const value = getArg(name);
  if (!value) {
    console.error(`Missing required argument: --${name}`);
    process.exit(1);
  }
  return value;
}

async function main(): Promise<void> {
  switch (command) {
    case 'extract': {
      const vendorRaw = requireArg('vendor');
      const vendor = vendorIdSchema.parse(vendorRaw) as VendorId;
      const planId = getArg('plan');
      const output = getArg('output') ?? `./extracted-${vendor}.json`;

      console.log(`Extracting rules from ${vendor}...`);
      console.log(`Plan: ${planId ?? 'all'}`);
      console.log(`Output: ${output}`);

      const extractConnector = loadConnector(vendor);
      const extractAuth = getVendorAuth(vendor);
      const connectResult = await extractConnector.connect(extractAuth);
      if (!connectResult.connected) {
        console.error(`Connection failed: ${connectResult.error}`);
        process.exit(1);
      }
      console.log(`Connected as ${connectResult.authenticatedAs} (API ${connectResult.apiVersion})`);

      const rules = await extractConnector.extractRules({ planId });
      fs.writeFileSync(output, JSON.stringify(rules, null, 2));
      console.log(`Extracted ${rules.length} raw rules → ${output}`);

      await extractConnector.disconnect();
      break;
    }

    case 'normalize': {
      const input = requireArg('input');
      const output = getArg('output') ?? './normalized.json';

      console.log(`Normalizing rules from ${input}...`);
      console.log(`Output: ${output}`);

      // TODO: Load raw rules and run through interpreter + normalizer
      // const rawRules = JSON.parse(fs.readFileSync(input, 'utf-8'));
      // const interpreter = new ConceptExtractor(getInterpreterConfig());
      // const normalized = await interpreter.interpretRules(rawRules);
      // fs.writeFileSync(output, JSON.stringify(normalized, null, 2));

      console.log('Normalize command not yet implemented');
      break;
    }

    case 'pipeline': {
      const vendorRaw = requireArg('vendor');
      const vendor = vendorIdSchema.parse(vendorRaw) as VendorId;
      const planId = getArg('plan');
      const output = getArg('output') ?? `./pipeline-${vendor}.json`;

      console.log(`Running full pipeline for ${vendor}...`);
      console.log(`Plan: ${planId ?? 'all'}`);
      console.log(`Output: ${output}`);

      const pipelineConnector = loadConnector(vendor);
      const result = await Pipeline.run(pipelineConnector, {
        auth: getVendorAuth(vendor),
        interpreter: getInterpreterConfig(),
        extractOptions: { planId },
      });
      fs.writeFileSync(output, JSON.stringify(result, null, 2));
      console.log(`Pipeline complete → ${output}`);
      break;
    }

    case 'list-plans': {
      const vendorRaw = requireArg('vendor');
      const vendor = vendorIdSchema.parse(vendorRaw) as VendorId;

      const listConnector = loadConnector(vendor);
      const listAuth = getVendorAuth(vendor);
      const listStatus = await listConnector.connect(listAuth);
      if (!listStatus.connected) {
        console.error(`Connection failed: ${listStatus.error}`);
        process.exit(1);
      }

      const plans = await listConnector.listPlans();
      console.log(`Found ${plans.length} plans in ${vendor}:`);
      for (const p of plans) {
        console.log(`  ${p.id}  ${p.name}`);
      }

      await listConnector.disconnect();
      break;
    }

    default:
      console.log('Universal ICM Connector CLI');
      console.log('');
      console.log('Commands:');
      console.log('  extract    --vendor <id> [--plan <id>] [--output <path>]');
      console.log('  list-plans --vendor <id>');
      console.log('  normalize  --input <path> [--output <path>]');
      console.log('  pipeline   --vendor <id> [--plan <id>] [--output <path>]');
      console.log('');
      console.log('Vendors: varicent, xactly, sap-successfactors, captivateiq, salesforce');
      break;
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
