async function main() {
  const url = 'http://161.35.49.70:3050/get/games';
  const res = await fetch(url);
  const data: any = await res.json();
  const games: any[] = data.games;

  // Show QF/SF/Third/Final matches (97-104)
  const lateGames = games.filter((g: any) => parseInt(g.id) >= 97);
  console.log(`\nMatches 97+ (QF/SF/Final):`);
  lateGames.forEach((g: any) => {
    console.log(`- [Match ${g.id}] Home: '${g.home_team_name_en}' (label: '${g.home_team_label}'), Away: '${g.away_team_name_en}' (label: '${g.away_team_label}') | Type: ${g.type} | Date: ${g.local_date} | Finished: ${g.finished}`);
  });

  // Also show the R16 match winners so we can resolve QF teams
  console.log(`\nR16 matches (89-96) - to resolve QF teams:`);
  const r16Games = games.filter((g: any) => parseInt(g.id) >= 89 && parseInt(g.id) <= 96);
  r16Games.forEach((g: any) => {
    const winnerId = g.winner_team_id;
    let winnerName = 'N/A';
    if (winnerId === g.home_team_id) winnerName = g.home_team_name_en;
    else if (winnerId === g.away_team_id) winnerName = g.away_team_name_en;
    console.log(`- [Match ${g.id}] ${g.home_team_name_en} vs ${g.away_team_name_en} | Score: ${g.home_score}-${g.away_score} | Winner: ${winnerName} (winner_team_id: ${winnerId})`);
  });
}

main().catch(console.error);
