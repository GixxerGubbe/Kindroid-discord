import {
  Client,
  GatewayIntentBits,
  Message,
  TextChannel,
  DMChannel,
  ChannelType,
  BaseGuildTextChannel,
  Partials,
  Events
} from "discord.js";
import { BotConfig } from "./config";
import { callKindroidAI, ephemeralFetchConversation } from "./kindroidApi";

const activeBots = new Map<string, Client>();
const dmConversationCounts = new Map<string, { count: number; lastMessageTime: number }>();

async function createDiscordClientForBot(botConfig: BotConfig): Promise<Client> {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
  });

  client.once("ready", () => {
    console.log(`Bot [${botConfig.id}] logged in as ${client.user?.tag}`);
    client.user?.setActivity("Schack med Barkbit");
  });

  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot && message.author.id === client.user?.id) return;
    if (message.author.bot) return;

    const botUser = client.user!;
    const botUsername = botUser.username.toLowerCase();
    const isMentioned = message.mentions.users.has(botUser.id);
    const containsBotName = message.content.toLowerCase().includes(botUsername);

    if (false) return; 

    try {
      if (message.channel instanceof BaseGuildTextChannel || message.channel instanceof DMChannel) {
        await message.channel.sendTyping();
      }

      const conversationArray = await ephemeralFetchConversation(message.channel, 30, 5000);
      const aiResult = await callKindroidAI(botConfig.sharedAiCode, conversationArray, botConfig.enableFilter);

      if (aiResult.type === "rate_limited") return;

      if (isMentioned) {
        await message.reply(aiResult.reply);
      } else if (message.channel instanceof BaseGuildTextChannel || message.channel instanceof DMChannel) {
        await message.channel.send(aiResult.reply);
      }
    } catch (error) {
      console.error(`[Bot ${botConfig.id}] Error:`, error);
      const errorMessage = "Beep boop, something went wrong.";
      if (isMentioned) {
        await message.reply(errorMessage);
      } else if (message.channel instanceof BaseGuildTextChannel || message.channel instanceof DMChannel) {
        await message.channel.send(errorMessage);
      }
    }
  });

  client.on("error", (error: Error) => {
    console.error(`[Bot ${botConfig.id}] WebSocket error:`, error);
  });

  try {
    await client.login(botConfig.discordBotToken);
    activeBots.set(botConfig.id, client);
  } catch (error) {
    console.error(`Failed to login bot ${botConfig.id}:`, error);
    throw error;
  }

  return client;
}

async function handleDirectMessage(message: Message, botConfig: BotConfig): Promise<void> {
  if (message.channel instanceof DMChannel) {
    await message.channel.sendTyping();
    const conversationArray = await ephemeralFetchConversation(message.channel, 30, 5000);
    const aiResult = await callKindroidAI(botConfig.sharedAiCode, conversationArray, botConfig.enableFilter);
    if (aiResult.type === "rate_limited") return;
    await message.reply(aiResult.reply);
  }
}

async function initializeAllBots(botConfigs: BotConfig[]): Promise<Client[]> {
  const initPromises = botConfigs.map((config) => createDiscordClientForBot(config).catch(() => null));
  const results = await Promise.all(initPromises);
  return results.filter((client): client is Client => client !== null);
}

async function shutdownAllBots(): Promise<void> {
  const shutdownPromises = Array.from(activeBots.entries()).map(async ([id, client]) => {
    try { await client.destroy(); } catch (error) { console.error(error); }
  });
  await Promise.all(shutdownPromises);
  activeBots.clear();
}

export { initializeAllBots, shutdownAllBots };
