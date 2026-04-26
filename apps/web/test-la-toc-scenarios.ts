import { computeScenarios, computeMaxFAR } from './lib/zoning';

async function main() {
  console.log('--- Testing LA TOC Scenario Logic ---');

  // Real data from our previous Bixel St test
  const parcel = {
    address: '722 S BIXEL ST LOS ANGELES CA 90017',
    zoning: 'CW', // Central City West
    lotArea: 87956,
    builtArea: 87956, // Let's assume it's fully built out for this test
  };

  // Mocking the data flow from DueIntelligence API
  const baseMaxFAR = 3.0; // Typical base for Central City
  const builtFAR = 1.0;
  const tocTier = 'TOC Tier 3'; // Let's assume Tier 3 for this location (near 7th/Metro)

  console.log(`Parcel: ${parcel.address}`);
  console.log(`Zoning: ${parcel.zoning} | Lot Area: ${parcel.lotArea.toLocaleString()} SF`);
  console.log(`Base Max FAR: ${baseMaxFAR} | Detected Tier: ${tocTier}`);
  console.log('\n--- CALCULATING SCENARIOS ---');

  const scenarios = computeScenarios(
    parcel.zoning,
    parcel.lotArea,
    baseMaxFAR,
    builtFAR,
    tocTier
  );

  scenarios.forEach((s, i) => {
    console.log(`\nScenario ${i + 1}: ${s.name}`);
    console.log(`  Max FAR: ${s.maxFAR.toFixed(2)} (Bonus: +${s.mihBonusFAR.toFixed(2)})`);
    console.log(`  Max Buildable: ${Math.round(s.maxBuildableSF).toLocaleString()} SF`);
    console.log(`  Total Units: ${s.estimatedUnits}`);
    console.log(`  Affordability: ${s.affordabilityReq}`);
    console.log(`  Market Rate: ${s.marketRateUnits} | Affordable: ${s.affordableUnits}`);
  });
}

main();
