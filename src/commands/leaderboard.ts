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
        .setDescription("Show today's daily F26 Coins leaderboard")
    )
    .addSubcommand(sub =>
      sub
        .setName('weekly')
        .setDescription('Show the weekly accumulated F26 Coins leaderboard')
    )
    .addSubcommand(sub =>
      sub
        .setName('monthly')
        .setDescription('Show the monthly accumulated F26 Coins leaderboard')
    )
    .addSubcommand(sub =>
      sub
        .setName('overall')
        .setDescription('Show the overall all-time F26 Coins leaderboard')
    )
    .addSubcommand(sub =>
      sub
        .setName('coins')
        .setDescription('Show the global F26 Coins leaderboard')
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
      } else if (subcommand === 'overall') {
        await handleOverallLeaderboard(interaction);
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

/**
 * Calculates start of a specific date at 12:00 AM in the Asia/Kolkata timezone.
 */
function getISTMidnight(dateOffset = 0): Date {
  const now = new Date();
  const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  if (dateOffset !== 0) {
    istTime.setDate(istTime.getDate() + dateOffset);
  }
  istTime.setHours(0, 0, 0, 0);
  const diff = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getTime();
  return new Date(istTime.getTime() + diff);
}

async function handleDailyLeaderboard(interaction: ChatInputCommandInteraction) {
  const todayStr = getISTDateString(0);
  const startOfToday = getISTMidnight(0);

  // Group transactions by user for today
  const transactions = await prisma.coinTransaction.groupBy({
    by: ['userId'],
    _sum: { amount: true },
    where: {
      createdAt: { gte: startOfToday },
      amount: { gt: 0 } // Only positive coin gains
    },
    orderBy: {
      _sum: { amount: 'desc' }
    },
    take: 10
  });

  if (transactions.length === 0) {
    await interaction.editReply({
      content: `📊 **Daily F26 Coins Leaderboard - ${todayStr}**\nNo coins have been earned today yet. Play the quiz or submit prediction polls to rank first!`
    });
    return;
  }

  // Fetch usernames
  const userIds = transactions.map((t) => t.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } }
  });

  const embed = new EmbedBuilder()
    .setTitle(`🏆 Daily F26 Coins Leaderboard - ${todayStr}`)
    .setDescription('Ranks players by total F26 Coins earned today (quiz participation, podiums, and correct predictions).')
    .setColor(0xf59e0b)
    .setTimestamp();

  const lines = transactions.map((t, index) => {
    const user = users.find((u) => u.id === t.userId);
    const totalCoins = t._sum.amount || 0;
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `\`#${index + 1}\``;
    return `${medal} <@${t.userId}> - **${totalCoins}** F26 Coins`;
  });

  embed.addFields({ name: 'Top Earners Today', value: lines.join('\n') });

  await interaction.editReply({ embeds: [embed] });
}

async function handleWeeklyLeaderboard(interaction: ChatInputCommandInteraction) {
  // Calculate start of current week (Monday 12:00 AM IST)
  const now = new Date();
  const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const day = istTime.getDay();
  const diffDays = istTime.getDate() - day + (day === 0 ? -6 : 1);
  istTime.setDate(diffDays);
  istTime.setHours(0, 0, 0, 0);
  const diff = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getTime();
  const startOfWeek = new Date(istTime.getTime() + diff);

  // Group transactions by user for this week
  const transactions = await prisma.coinTransaction.groupBy({
    by: ['userId'],
    _sum: { amount: true },
    where: {
      createdAt: { gte: startOfWeek },
      amount: { gt: 0 }
    },
    orderBy: {
      _sum: { amount: 'desc' }
    },
    take: 10
  });

  if (transactions.length === 0) {
    await interaction.editReply({
      content: '📊 **Weekly F26 Coins Leaderboard**\nNo coins logged for this week yet!'
    });
    return;
  }

  // Fetch usernames
  const userIds = transactions.map((t) => t.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } }
  });

  const embed = new EmbedBuilder()
    .setTitle('📅 Weekly Accumulated F26 Coins Leaderboard')
    .setDescription(`Cumulative F26 Coins earned since Monday, ${startOfWeek.toLocaleDateString('en-IN')}`)
    .setColor(0x10b981)
    .setTimestamp();

  const lines = transactions.map((t, index) => {
    const user = users.find((u) => u.id === t.userId);
    const totalCoins = t._sum.amount || 0;
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `\`#${index + 1}\``;
    return `${medal} <@${t.userId}> - **${totalCoins}** F26 Coins`;
  });

  embed.addFields({ name: 'Top Weekly Earners', value: lines.join('\n') });

  await interaction.editReply({ embeds: [embed] });
}

async function handleMonthlyLeaderboard(interaction: ChatInputCommandInteraction) {
  // Calculate start of current month (1st day 12:00 AM IST)
  const now = new Date();
  const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  istTime.setDate(1);
  istTime.setHours(0, 0, 0, 0);
  const diff = now.getTime() - new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getTime();
  const startOfMonth = new Date(istTime.getTime() + diff);

  // Group transactions by user for this month
  const transactions = await prisma.coinTransaction.groupBy({
    by: ['userId'],
    _sum: { amount: true },
    where: {
      createdAt: { gte: startOfMonth },
      amount: { gt: 0 }
    },
    orderBy: {
      _sum: { amount: 'desc' }
    },
    take: 10
  });

  if (transactions.length === 0) {
    await interaction.editReply({
      content: '📊 **Monthly F26 Coins Leaderboard**\nNo coins logged for this month yet!'
    });
    return;
  }

  // Fetch usernames
  const userIds = transactions.map((t) => t.userId);
  const users = await prisma.user.findMany({
    where: { id: { in: userIds } }
  });

  const embed = new EmbedBuilder()
    .setTitle('📆 Monthly Accumulated F26 Coins Leaderboard')
    .setDescription(`Cumulative F26 Coins earned since the start of ${now.toLocaleString('default', { month: 'long' })}`)
    .setColor(0x3b82f6)
    .setTimestamp();

  const lines = transactions.map((t, index) => {
    const user = users.find((u) => u.id === t.userId);
    const totalCoins = t._sum.amount || 0;
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `\`#${index + 1}\``;
    return `${medal} <@${t.userId}> - **${totalCoins}** F26 Coins`;
  });

  embed.addFields({ name: 'Top Monthly Earners', value: lines.join('\n') });

  await interaction.editReply({ embeds: [embed] });
}

async function handleOverallLeaderboard(interaction: ChatInputCommandInteraction) {
  // Fetch top 10 users by current total coins
  const topUsers = await prisma.user.findMany({
    orderBy: { coins: 'desc' },
    take: 10
  });

  if (topUsers.length === 0) {
    await interaction.editReply({
      content: '📊 **Overall F26 Coins Leaderboard**\nNo users logged in the database yet!'
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('🏆 Overall All-Time F26 Coins Leaderboard')
    .setDescription('Top users holding the most F26 Coins overall!')
    .setColor(0x8b5cf6)
    .setTimestamp();

  const lines = topUsers.map((user, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `\`#${index + 1}\``;
    return `${medal} <@${user.id}> - **${user.coins}** F26 Coins`;
  });

  embed.addFields({ name: 'All-Time Champions', value: lines.join('\n') });

  await interaction.editReply({ embeds: [embed] });
}

async function handleCoinsLeaderboard(interaction: ChatInputCommandInteraction) {
  // Coins leaderboard is identical to overall, showing current global balance
  const topUsers = await prisma.user.findMany({
    orderBy: { coins: 'desc' },
    take: 10
  });

  if (topUsers.length === 0) {
    await interaction.editReply({
      content: '📊 **Global F26 Coins Leaderboard**\nNo users logged in the database yet!'
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('💰 Global F26 Coins Leaderboard')
    .setDescription('Top users holding the most F26 Coins!')
    .setColor(0xeab308)
    .setTimestamp();

  const lines = topUsers.map((user, index) => {
    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `\`#${index + 1}\``;
    return `${medal} <@${user.id}> - **${user.coins}** F26 Coins`;
  });

  embed.addFields({ name: 'Top Wealthy Fans', value: lines.join('\n') });

  await interaction.editReply({ embeds: [embed] });
}
