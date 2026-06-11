import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  ButtonBuilder,
  ActionRowBuilder,
  ButtonStyle,
  ButtonInteraction
} from 'discord.js';
import { prisma } from '../services/db';
import { getISTDateString } from '../utils/date';
import { Command } from './index';

export interface QuizSession {
  quizId: string;
  questions: {
    question: string;
    options: string[];
    correctAnswerIndex: number;
    explanation: string;
  }[];
  currentIndex: number;
  score: number;
  startedAt: Date;
  answers: number[];
}

// Memory cache for active quiz sessions
export const activeQuizSessions = new Map<string, QuizSession>();

export async function handleQuizStart(interaction: ChatInputCommandInteraction | ButtonInteraction): Promise<void> {
  const userId = interaction.user.id;
  const todayStr = getISTDateString(0);

  // Check if the current time is 6:00 PM IST or later
  const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  if (nowIST.getHours() >= 18) {
    await interaction.editReply({
      content: "⚽ Quiz  is scheduled  for  2:30pm everyday!"
    });
    return;
  }

  // 1. Check if user has an active session
  if (activeQuizSessions.has(userId)) {
    await interaction.editReply({
      content: '⚠️ You already have an active quiz session in progress! Please complete that one first.'
    });
    return;
  }

  // 2. Fetch today's quiz from DB
  const quiz = await prisma.quiz.findUnique({
    where: { date: todayStr }
  });

  if (!quiz) {
    await interaction.editReply({
      content: '⚽ Today\'s quiz has not been generated yet. Quizzes are generated daily at 10:20 AM IST. Please try again later!'
    });
    return;
  }

  // 3. Check if user has already completed today's quiz
  const participation = await prisma.quizParticipation.findUnique({
    where: {
      userId_quizId: {
        userId,
        quizId: quiz.id
      }
    }
  });

  if (participation) {
    const durationSec = (participation.durationMs / 1000).toFixed(1);
    await interaction.editReply({
      content: `❌ You have already completed today's quiz!\n• Score: **${participation.score}/10**\n• Time: **${durationSec}s**\nThank you for participating! Check how you ranked using \`/leaderboard daily\`.`
    });
    return;
  }

  // 4. Initialize session
  const questions = quiz.questions as any[];
  const session: QuizSession = {
    quizId: quiz.id,
    questions,
    currentIndex: 0,
    score: 0,
    startedAt: new Date(),
    answers: []
  };

  activeQuizSessions.set(userId, session);

  // 5. Send first question ephemerally by editing the deferred reply
  const embed = buildQuestionEmbed(session, 0);
  const row = buildQuestionComponents(session, 0);

  await interaction.editReply({
    embeds: [embed],
    components: [row]
  });
}

export const quizCommand: Command = {
  data: new SlashCommandBuilder()
    .setName('quiz')
    .setDescription("Start today's FIFA World Cup 2026 daily quiz"),

  async execute(interaction: ChatInputCommandInteraction, client: Client): Promise<void> {
    await handleQuizStart(interaction);
  }
};

export function buildQuestionEmbed(session: QuizSession, index: number): EmbedBuilder {
  const q = session.questions[index];
  return new EmbedBuilder()
    .setTitle(`📝 FIFA World Cup 2026 Daily Quiz - Question ${index + 1}/10`)
    .setDescription(`**${q.question}**`)
    .setColor(0x3b82f6)
    .setFooter({ text: 'Select an option to proceed. The timer is running!' });
}

export function buildQuestionComponents(session: QuizSession, index: number): ActionRowBuilder<ButtonBuilder> {
  const q = session.questions[index];
  const row = new ActionRowBuilder<ButtonBuilder>();
  q.options.forEach((opt, optIdx) => {
    // Discord buttons customId limit is 100 chars, option labels max 80 chars
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`quiz_opt_${index}_${optIdx}`)
        .setLabel(opt.length > 80 ? opt.substring(0, 77) + '...' : opt)
        .setStyle(ButtonStyle.Primary)
    );
  });
  return row;
}
