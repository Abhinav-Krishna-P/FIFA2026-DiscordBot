import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder
} from 'discord.js';
import { prisma } from '../services/db';
import { getISTDateString } from '../utils/date';
import { Command } from './index';

export const leaderboardCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('leaderboard')
    .setDescription('Display FIFA World Cup 2026 bot leaderboards')
    .addSubcommand(sub =>
      sub
        .setName('daily')
        .setDescription("Show today's daily quiz leaderboard")
    )
    .addSubcommand(sub =>
      sub
        .setName('weekly')
        .setDescription('Show the weekly accumulated quiz leaderboard')
    )
    .addSubcommand(sub =>
      sub
        .setName('monthly')
        .setDescription('Show the monthly accumulated quiz leaderboard')
    )
    .addSubcommand(sub =>
      sub
        .setName('coins')
        .setDescription('Show the global FIFA W Coins leaderboard')
    ),

  async execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    const subcommand = interaction.options.getSubcommand();

    try {
      if (subcommand === 'daily') {
        await handleDailyLeaderboard(interaction);
      } else if (subcommand === 'weekly') {
        await handleWeeklyLeaderboard(interaction);
      } else if (subcommand === 'monthly') {
        await handleMonthlyLeaderboard(interaction);
      } else if (subcommand === 'coins') {
        await handleCoinsLeaderboard(interaction);
      }
    } catch (error) {
      console.error(`Error executing leaderboard command (${subcommand}):`, error);
      await interaction.editReply({
        content: '❌ An error occurred while retrieving the leaderboard.'
      });
    }
  }
};

async function handleDailyLeaderboard(interaction: ChatInputCommandInteraction) {
  const todayStr = getISTDateString(0);

  // Find today's quiz
  const quiz = await prisma.quiz.findUnique({
    where: { date: todayStr }
  });

  if (!quiz) {
    await interaction.editReply({
      content: `⚽ No quiz has been played today (${todayStr}) yet. Try taking the quiz with \`/quiz\` once it is live!`
    });
    return;
  }

  // Fetch top 10 participations
  const participations = await prisma.quizParticipation.findMany({
    where: { quizId: quiz.id },
    orderBy: [
      { score: 'desc' },
      { durationMs: 'asc' }
    ],
    take: 10,
    include: { user: true }
  });

  if (participations.length === 0) {
    await interaction.editReply({
      content: `📊 **Daily Quiz Leaderboard - ${todayStr}**\nNo users have participated in today's quiz yet. Be the first by running \`/quiz\`!`
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🏆 Daily Quiz Leaderboard - ${todayStr}`)
    .setDescription('Ranked by highest score, then fastest completion time.')
    .setColor(0xf59e0b)
    .setTimestamp();

  const lines = participations.map((part, index) => {
    const timeInSec = (part.durationMs / 1000).toFixed(1);
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `\`#${index + 1}\``;
    return `${medal} <@${part.userId}> - **${part.score}/10** in **${timeInSec}s**`;
  });

  embed.addFields({ name: 'Top Participants', value: lines.join('\n') });

  await interaction.editReply({ embeds: [embed] });
}

async function handleWeeklyLeaderboard(interaction: ChatInputCommandInteraction) {
  // Calculate start of current week (Monday 00:00:00 IST)
  const now = new Date();
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay();
  const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1); // Adjust for Sunday
  startOfWeek.setDate(diff);
  startOfWeek.setHours(0, 0, 0, 0);

  // Group quiz participations by user in the current week
  const participations = await prisma.quizParticipation.groupBy({
    by: ['userId'],
    _sum: { score: true },
    _count: { id: true },
    where: {
      startedAt: { gte: startOfWeek }
    },
    orderBy: {
      _sum: { score: 'desc' }
    },
    take: 10
  });

  if (participations.length === 0) {
    await interaction.editReply({
      content: '📊 **Weekly Quiz Leaderboard**\nNo quiz scores logged for this week yet!'
    });
    return;
  }

  // Fetch usernames
  const userIds = participations.map((p) => p.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } }
  });

  const embed = new EmbedBuilder()
    .setTitle('📅 Weekly Accumulated Quiz Leaderboard')
    .setDescription(`Cumulative quiz scores since Monday, ${startOfWeek.toLocaleDateString('en-IN')}`)
    .setColor(0x10b981)
    .setTimestamp();

  const lines = participations.map((p, index) => {
    const user = users.find((u) => u.id === p.userId);
    const username = user ? user.username : 'Unknown User';
    const totalScore = p._sum.score || 0;
    const totalQuizzes = p._count.id;
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `\`#${index + 1}\``;
    return `${medal} <@${p.userId}> - **${totalScore}** points (from ${totalQuizzes} quizzes)`;
  });

  embed.addFields({ name: 'Top Trivia Competitors', value: lines.join('\n') });

  await interaction.editReply({ embeds: [embed] });
}

async function handleMonthlyLeaderboard(interaction: ChatInputCommandInteraction) {
  // Calculate start of current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);

  // Group quiz participations by user in the current month
  const participations = await prisma.quizParticipation.groupBy({
    by: ['userId'],
    _sum: { score: true },
    _count: { id: true },
    where: {
      startedAt: { gte: startOfMonth }
    },
    orderBy: {
      _sum: { score: 'desc' }
    },
    take: 10
  });

  if (participations.length === 0) {
    await interaction.editReply({
      content: '📊 **Monthly Quiz Leaderboard**\nNo quiz scores logged for this month yet!'
    });
    return;
  }

  // Fetch usernames
  const userIds = participations.map((p) => p.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } }
  });

  const embed = new EmbedBuilder()
    .setTitle('📆 Monthly Accumulated Quiz Leaderboard')
    .setDescription(`Cumulative quiz scores since the start of ${now.toLocaleString('default', { month: 'long' })}`)
    .setColor(0x3b82f6)
    .setTimestamp();

  const lines = participations.map((p, index) => {
    const user = users.find((u) => u.id === p.userId);
    const totalScore = p._sum.score || 0;
    const totalQuizzes = p._count.id;
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `\`#${index + 1}\``;
    return `${medal} <@${p.userId}> - **${totalScore}** points (from ${totalQuizzes} quizzes)`;
  });

  embed.addFields({ name: 'Top Trivia Competitors', value: lines.join('\n') });

  await interaction.editReply({ embeds: [embed] });
}

async function handleCoinsLeaderboard(interaction: ChatInputCommandInteraction) {
  // Fetch top 10 coin owners
  const topUsers = await prisma.user.findMany({
    orderBy: { coins: 'desc' },
    take: 10
  });

  if (topUsers.length === 0) {
    await interaction.editReply({
      content: '📊 **Coins Leaderboard**\nNo users logged in the database yet!'
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('💰 Global FIFA W Coins Leaderboard')
    .setDescription('Top users holding the most FIFA W Coins!')
    .setColor(0xeab308)
    .setTimestamp();

  const lines = topUsers.map((user, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `\`#${index + 1}\``;
    return `${medal} <@${user.id}> - **${user.coins}** FIFA W Coins`;
  });

  embed.addFields({ name: 'Top Wealthy Fans', value: lines.join('\n') });

  await interaction.editReply({ embeds: [embed] });
}
