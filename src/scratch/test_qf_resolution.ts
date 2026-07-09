/**
 * Test ALL knockout matches (97-104) to verify resolveTeamName works for every stage.
 */
import { FootballService } from '../services/football';

async function main() {
  console.log('🧪 Testing ALL knockout match resolution...\n');

  const knockoutDates = [
    '2026-07-09', // QF1 (Match 97)
    '2026-07-10', // QF2 (Match 98)
    '2026-07-11', // QF3 + QF4 (Match 99, 100)
    '2026-07-14', // SF1 (Match 101)
    '2026-07-15', // SF2 (Match 102)
    '2026-07-18', // Third Place (Match 103)
    '2026-07-19', // Final (Match 104)
  ];

  for (const date of knockoutDates) {
    console.log(`\n--- ${date} ---`);
    const fixtures = await FootballService.getFixtures(date);
    if (fixtures.length > 0) {
      fixtures.forEach(f => {
        console.log(`  ✅ Match ${f.id}: ${f.homeTeam} vs ${f.awayTeam} (${f.status})`);
      });
    } else {
      console.log(`  ⚠️ No fixtures found`);
    }
  }

  console.log('\n🏁 All knockout dates tested!');
}

main().catch(console.error);
