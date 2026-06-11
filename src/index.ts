import {
  Client,
  GatewayIntentBits,
  Interaction,
  EmbedBuilder,
  TextChannel
} from 'discord.js';
import dotenv from 'dotenv';
import { commands } from './commands';
import { activeQuizSessions, buildQuestionEmbed, buildQuestionComponents, handleQuizStart } from './commands/quiz';
import { connectDb, prisma } from './services/db';
import { SchedulerService } from './services/scheduler';

dotenv.config();

const token = process.env.DISCORD_TOKEN;

if (!token) {
  console.error('❌ DISCORD_TOKEN is not defined in the environment variables.');
  process.exit(1);
}

// Initialize Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
  ],
});

// Event: Ready
client.once('ready', async () => {
  console.log(`🤖 Bot is logged in as ${client.user?.tag}`);

  // Connect to Database
  await connectDb();

  // Start Scheduler
  const scheduler = new SchedulerService(client);
  scheduler.start();
});

// Event: Interaction Create (Commands & Button Clicks)
client.on('interactionCreate', async (interaction: Interaction) => {
  // 1. Handle Slash Commands
  if (interaction.isChatInputCommand()) {
    const command = commands.find(c => c.data.name === interaction.commandName);
    if (!command) return;

    // Defer the reply immediately to prevent 3-second timeouts
    const ephemeralCommands = ['quiz', 'polls', 'force-generate-quiz', 'force-generate-polls', 'settle-polls', 'adjust-coins'];
    const isEphemeral = ephemeralCommands.includes(interaction.commandName);

    try {
      await interaction.deferReply({ ephemeral: isEphemeral });
    } catch (err) {
      console.error(`Failed to defer reply for command ${interaction.commandName}:`, err);
      return;
    }

    // Ensure user is created in DB before executing command to prevent database race conditions
    try {
      await prisma.user.upsert({
        where: { id: interaction.user.id },
        update: { username: interaction.user.username },
        create: {
          id: interaction.user.id,
          username: interaction.user.username,
          coins: 0
        }
      });
    } catch (err) {
      console.error('Failed to upsert user in slash command handler:', err);
    }

    try {
      await command.execute(interaction, client);
    } catch (error) {
      console.error(`Error executing command ${interaction.commandName}:`, error);
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: '❌ There was an error while executing this command!', ephemeral: true });
      } else {
        await interaction.reply({ content: '❌ There was an error while executing this command!', ephemeral: true });
      }
    }
  }

  // 2. Handle Button Interactions
  else if (interaction.isButton()) {
    const customId = interaction.customId;

    // --- CASE A: Match Prediction Button Click ---
    if (customId.startsWith('predict_')) {
      // Format: predict_{matchId}_{prediction}
      const parts = customId.split('_');
      if (parts.length < 3) return;

      const matchId = parts[1];
      const predictionChoice = parts[2]; // 'HOME', 'DRAW', or 'AWAY'

      await interaction.deferReply({ ephemeral: true });

      try {
        // Find matching poll in DB using message ID
        const poll = await prisma.matchPredictionPoll.findUnique({
          where: { id: interaction.message.id }
        });

        if (!poll) {
          await interaction.editReply({
            content: '❌ Error: Prediction poll record not found in the database.'
          });
          return;
        }

        // Check if poll status is active
        if (poll.status !== 'active') {
          await interaction.editReply({
            content: '❌ Voting for this match has already been settled and is closed.'
          });
          return;
        }

        // Check if kickoff time has passed
        const now = new Date();
        if (now >= poll.kickoffTime) {
          await interaction.editReply({
            content: '❌ Voting has closed! The match has already kicked off.'
          });
          return;
        }

        // Ensure user exists in database
        await prisma.user.upsert({
          where: { id: interaction.user.id },
          update: { username: interaction.user.username },
          create: {
            id: interaction.user.id,
            username: interaction.user.username,
            coins: 0
          }
        });

        // Check if user already predicted on this poll
        const existingPrediction = await prisma.prediction.findUnique({
          where: {
            pollId_userId: {
              pollId: poll.id,
              userId: interaction.user.id
            }
          }
        });

        if (existingPrediction) {
          const predictedTeamName = existingPrediction.predictedWinner === 'DRAW'
            ? 'Draw'
            : (existingPrediction.predictedWinner === 'HOME' ? poll.homeTeam : poll.awayTeam);
          await interaction.editReply({
            content: `❌ You have already submitted a prediction for this match! Predicted: **${predictedTeamName}**. Predictions cannot be changed.`
          });
          return;
        }

        // Record prediction
        await prisma.prediction.create({
          data: {
            pollId: poll.id,
            userId: interaction.user.id,
            predictedWinner: predictionChoice
          }
        });

        const choiceText = predictionChoice === 'DRAW'
          ? 'Draw'
          : (predictionChoice === 'HOME' ? poll.homeTeam : poll.awayTeam);

        await interaction.editReply({
          content: `✅ Your prediction for **${choiceText}** has been successfully recorded! Good luck!`
        });
      } catch (err) {
        console.error('Error recording prediction:', err);
        await interaction.editReply({
          content: '❌ Failed to submit prediction due to a database error.'
        });
      }
    }

    // --- CASE C: Start Quiz Button Click ---
    else if (customId === 'quiz_start_button') {
      await interaction.deferReply({ ephemeral: true });
      try {
        await handleQuizStart(interaction);
      } catch (err) {
        console.error('Error starting quiz via button:', err);
        await interaction.editReply({
          content: '❌ Failed to start quiz due to an error.'
        });
      }
    }

    // --- CASE B: Quiz Option Button Click ---
    else if (customId.startsWith('quiz_opt_')) {
      // Format: quiz_opt_{questionIndex}_{optionIndex}
      const parts = customId.split('_');
      if (parts.length < 4) return;

      const questionIndex = parseInt(parts[2], 10);
      const optionIndex = parseInt(parts[3], 10);
      const userId = interaction.user.id;

      const session = activeQuizSessions.get(userId);

      if (!session) {
        await interaction.reply({
          content: '❌ Your quiz session has expired or is invalid. Please start a new quiz using `/quiz`.',
          ephemeral: true
        });
        return;
      }

      // Check if button click matches the current question index of user session
      if (questionIndex !== session.currentIndex) {
        await interaction.reply({
          content: '⚠️ This button belongs to a different question. Please select from the current question shown.',
          ephemeral: true
        });
        return;
      }

      // Record answer
      session.answers.push(optionIndex);

      const currentQuestion = session.questions[session.currentIndex];
      if (optionIndex === currentQuestion.correctAnswerIndex) {
        session.score++;
      }

      // Advance index
      session.currentIndex++;

      try {
        // If there are more questions, show next question
        if (session.currentIndex < 10) {
          const nextEmbed = buildQuestionEmbed(session, session.currentIndex);
          const nextRow = buildQuestionComponents(session, session.currentIndex);

          await interaction.update({
            embeds: [nextEmbed],
            components: [nextRow]
          });
        }
        // If finished, process results and update DB
        else {
          await interaction.deferUpdate();

          const completedAt = new Date();
          const durationMs = completedAt.getTime() - session.startedAt.getTime();
          const score = session.score;

          // Ensure user is created in database
          await prisma.user.upsert({
            where: { id: userId },
            update: { username: interaction.user.username },
            create: {
              id: userId,
              username: interaction.user.username,
              coins: 0
            }
          });

          // Save participation to DB
          await prisma.quizParticipation.create({
            data: {
              userId,
              quizId: session.quizId,
              score,
              startedAt: session.startedAt,
              completedAt,
              durationMs,
              answers: session.answers as any
            }
          });

          // Update user statistics and award participation coin (+1)
          await prisma.user.update({
            where: { id: userId },
            data: {
              coins: { increment: 1 },
              totalQuizParticipation: { increment: 1 }
            }
          });

          // Log transaction
          await prisma.coinTransaction.create({
            data: {
              userId,
              amount: 1,
              reason: 'quiz_participation'
            }
          });

          // Check if they unlocked any achievements
          const achievementsToUnlock: { name: string; description: string }[] = [];

          // 1. Check for Perfect Trivia Score (10/10)
          if (score === 10) {
            const hasPerfectScoreAchievement = await prisma.achievement.findFirst({
              where: { userId, name: 'Perfect Trivia' }
            });
            if (!hasPerfectScoreAchievement) {
              achievementsToUnlock.push({
                name: 'Perfect Trivia',
                description: 'Answered all 10 questions correctly in a daily quiz!'
              });
            }
          }

          // 2. Check for first quiz participation
          const userParticipationsCount = await prisma.quizParticipation.count({
            where: { userId }
          });
          if (userParticipationsCount === 1) {
            achievementsToUnlock.push({
              name: 'First Kick',
              description: 'Completed your very first daily football quiz!'
            });
          }

          // 3. Unlock achievements in DB
          for (const achievement of achievementsToUnlock) {
            await prisma.achievement.create({
              data: {
                userId,
                name: achievement.name,
                description: achievement.description
              }
            });
          }

          // Build completion embed
          const durationSec = (durationMs / 1000).toFixed(1);
          const resultsEmbed = new EmbedBuilder()
            .setTitle('🏁 Daily Quiz Completed!')
            .setDescription(`Great effort, <@${userId}>! Your results have been locked in.`)
            .setColor(0x10b981)
            .addFields(
              { name: '📊 Correct Answers', value: `**${score}/10**`, inline: true },
              { name: '⏱️ Completion Time', value: `**${durationSec}s**`, inline: true },
              { name: '💰 Participation Reward', value: `**+1 FIFA W Coin**`, inline: true }
            )
            .setTimestamp();

          if (achievementsToUnlock.length > 0) {
            const unlockedList = achievementsToUnlock.map(a => `🏆 **${a.name}**: *${a.description}*`).join('\n');
            resultsEmbed.addFields({ name: '🎉 Unlocked Achievements!', value: unlockedList });
          }

          // Send final message in the same ephemeral thread
          await interaction.editReply({
            embeds: [resultsEmbed],
            components: []
          });

          // Clear active session
          activeQuizSessions.delete(userId);
        }
      } catch (err) {
        console.error('Error completing quiz session:', err);
        // Clean up session in case of database crash to prevent blocking user from retrying
        activeQuizSessions.delete(userId);
        await interaction.followUp({
          content: '❌ An error occurred while saving your quiz results. Your session was reset.',
          ephemeral: true
        });
      }
    }
  }
});

// Login Bot
client.login(token).catch(err => {
  console.error('❌ Failed to login to Discord: Check if your token is valid.', err);
});

// Safeguard against uncaught exceptions and unhandled promise rejections
process.on('unhandledRejection', (error) => {
  console.error('🛡️ Unhandled promise rejection caught:', error);
});

process.on('uncaughtException', (error) => {
  console.error('🛡️ Uncaught exception caught:', error);
});
