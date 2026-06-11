import { 
  SlashCommandBuilder, 
  ChatInputCommandInteraction, 
  Client,
  SlashCommandSubcommandsOnlyBuilder,
  SlashCommandOptionsOnlyBuilder
} from 'discord.js';

export interface Command {
  data: 
    | SlashCommandBuilder 
    | SlashCommandSubcommandsOnlyBuilder 
    | SlashCommandOptionsOnlyBuilder 
    | Omit<SlashCommandBuilder, "addSubcommand" | "addSubcommandGroup">;
  execute: (interaction: ChatInputCommandInteraction, client: Client) => Promise<void>;
}

import { quizCommand } from './quiz';
import { leaderboardCommand } from './leaderboard';
import { coinsCommand } from './coins';
import { profileCommand } from './profile';
import { pollsCommand } from './polls';

// Admin commands
import { forceQuizCommand } from './admin/forceQuiz';
import { forcePollsCommand } from './admin/forcePolls';
import { settlePollsCommand } from './admin/settlePolls';
import { adjustCoinsCommand } from './admin/adjustCoins';

export const commands: Command[] = [
  quizCommand,
  leaderboardCommand,
  coinsCommand,
  profileCommand,
  pollsCommand,
  forceQuizCommand,
  forcePollsCommand,
  settlePollsCommand,
  adjustCoinsCommand
];
