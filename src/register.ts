import { REST, Routes } from 'discord.js';
import dotenv from 'dotenv';
import { commands } from './commands';

dotenv.config();

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.DISCORD_GUILD_ID;

if (!token || !clientId) {
  console.error('❌ Missing DISCORD_TOKEN or DISCORD_CLIENT_ID in environment variables.');
  process.exit(1);
}

const commandsData = commands.map(cmd => cmd.data.toJSON());

const rest = new REST({ version: '10' }).setToken(token);

(async () => {
  try {
    console.log(`Started refreshing ${commandsData.length} application (/) commands.`);

    if (guildId && guildId.trim() !== '') {
      console.log(`Registering guild-specific commands to Guild ID: ${guildId}`);
      await rest.put(
        Routes.applicationGuildCommands(clientId, guildId),
        { body: commandsData },
      );
      console.log('✅ Successfully reloaded guild-specific application (/) commands.');
    } else {
      console.log('Registering commands globally...');
      await rest.put(
        Routes.applicationCommands(clientId),
        { body: commandsData },
      );
      console.log('✅ Successfully reloaded global application (/) commands.');
    }
  } catch (error) {
    console.error('❌ Error refreshing application commands:', error);
  }
})();
