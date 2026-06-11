import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder
} from 'discord.js';
import { prisma } from '../services/db';
import { Command } from './index';

export const pollsCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('polls')
    .setDescription('Display active prediction matches and your prediction status'),

  async execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    const userId = interaction.user.id;
    const guildId = interaction.guildId;

    if (!guildId) {
      await interaction.editReply({
        content: '⚠️ This command can only be used inside a Discord server.'
      });
      return;
    }

    try {
      // Fetch active prediction polls
      const activePolls = await prisma.matchPredictionPoll.findMany({
        where: { status: 'active' },
        orderBy: { kickoffTime: 'asc' }
      });

      if (activePolls.length === 0) {
        await interaction.editReply({
          content: '⚽ There are currently no active match prediction polls. Check back later!'
        });
        return;
      }

      // Fetch user's predictions for these polls
      const pollIds = activePolls.map(p => p.id);
      const userPredictions = await prisma.prediction.findMany({
        where: {
          pollId: { in: pollIds },
          userId: userId
        }
      });

      const embed = new EmbedBuilder()
        .setTitle('🔮 Active Match Predictions')
        .setDescription('Here are today\'s matches! Click the links to navigate to the poll and submit your prediction before kickoff.')
        .setColor(0x1d4ed8)
        .setTimestamp();

      const lines = activePolls.map((poll) => {
        const userPred = userPredictions.find(p => p.pollId === poll.id);

        let statusEmoji = '❓';
        let predictionText = '*Not predicted yet*';
        if (userPred) {
          statusEmoji = '✅';
          predictionText = `Predicted: **${userPred.predictedWinner === 'DRAW' ? 'Draw' : (userPred.predictedWinner === 'HOME' ? poll.homeTeam : poll.awayTeam)}**`;
        }

        const kickoffTimeFormatted = `<t:${Math.floor(poll.kickoffTime.getTime() / 1000)}:F>`;
        const pollLink = `https://discord.com/channels/${guildId}/${poll.channelId}/${poll.id}`;

        return `${statusEmoji} **${poll.homeTeam} vs ${poll.awayTeam}**\n` +
          `• Kickoff: ${kickoffTimeFormatted}\n` +
          `• Status: ${predictionText}\n` +
          `• Vote Here: [Jump to Poll](${pollLink})\n`;
      });

      embed.addFields({ name: 'Upcoming Matches', value: lines.join('\n') });

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      console.error('Error in polls command:', err);
      await interaction.editReply({
        content: '❌ An error occurred while fetching the active polls.'
      });
    }
  }
};
