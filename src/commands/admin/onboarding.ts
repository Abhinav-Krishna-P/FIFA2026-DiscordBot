import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  Client,
  PermissionFlagsBits,
  EmbedBuilder
} from 'discord.js';
import { Command } from '../index';

export const onboardingCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('onboarding')
    .setDescription("Admin: Post the detailed game onboarding and instructions guide")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    // Check for administrator permission
    if (!interaction.memberPermissions?.has('Administrator')) {
      await interaction.editReply({
        content: '❌ You do not have permission to run this command. (Requires Administrator)'
      });
      return;
    }

    try {
      const embed = new EmbedBuilder()
        .setTitle('🏆 Welcome to FIFA World Cup 2026 Companion! 🏆')
        .setDescription(
          `Get ready for the ultimate football prediction and trivia game! Participate daily, earn **FIFA W Coins (F26 Coins)**, unlock prestigious achievements, and climb to the top of the leaderboards.`
        )
        .setColor(0xd97706) // Premium Gold color
        .addFields(
          {
            name: '📅 1. Daily Quizzes (Trivia)',
            value: 
              `• **Timing:** Generated at **2:00 PM IST** daily and active until **6:00 PM IST**.\n` +
              `• **Gameplay:** Answer **10 trivia questions** about yesterday's match stats and World Cup history. Your speed and accuracy are tracked!\n` +
              `• **Rewards:**\n` +
              `  - 🏁 **+1 Coin** just for completing the quiz!\n` +
              `  - 🥇 **+20 Coins** for 1st Place Podium\n` +
              `  - 🥈 **+10 Coins** for 2nd Place\n` +
              `  - 🥉 **+5 Coins** for 3rd Place\n` +
              `• **Achievements:** Earn badges like *First Kick* (complete your 1st quiz) or *Perfect Trivia* (score 10/10).`
          },
          {
            name: '🔮 2. Match Prediction Polls',
            value:
              `• **Timing:** Polls for the day's matches are posted at **11:00 AM IST** daily. Settle and reward distribution happens at **10:00 AM IST** the next day.\n` +
              `• **Gameplay:** Select the team you predict will win (Home Win or Away Win) via the buttons before the match kicks off. Once submitted, predictions cannot be modified.\n` +
              `• **Rewards:** Earn **+5 Coins** for each correct prediction! (No loss for incorrect ones).`
          },
          {
            name: '📊 3. Coins & Leaderboards',
            value:
              `• **Coins (F26 Coins):** Your virtual currency representing your prediction accuracy and trivia knowledge.\n` +
              `• **Leaderboards:** Check out where you rank across multiple durations:\n` +
              `  - \`/leaderboard daily\` — Top earners today.\n` +
              `  - \`/leaderboard weekly\` — Accumulated weekly earnings (resets Monday).\n` +
              `  - \`/leaderboard monthly\` — Cumulative monthly earnings.\n` +
              `  - \`/leaderboard overall\` & \`/leaderboard coins\` — All-time global wealth standings.`
          },
          {
            name: '🎮 Useful Commands',
            value:
              `• \`/quiz\` — Start today's quiz session (private to you).\n` +
              `• \`/polls\` — View today's active match schedules and your prediction status.\n` +
              `• \`/profile [@user]\` — View stats, personal records, and unlocked achievements.\n` +
              `• \`/coins [@user]\` — Quick check of a user's F26 Coins balance.`
          }
        )
        .setFooter({ text: 'FIFA World Cup 2026 Bot • Happy Predicting!', iconURL: client.user?.displayAvatarURL() })
        .setTimestamp();

      await interaction.editReply({
        embeds: [embed]
      });
    } catch (error) {
      console.error('Error executing onboarding command:', error);
      await interaction.editReply({
        content: `❌ Failed to execute onboarding command: ${error instanceof Error ? error.message : String(error)}`
      });
    }
  }
};
